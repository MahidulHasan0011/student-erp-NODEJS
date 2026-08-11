import type { PoolClient } from 'pg';
import { withTransaction } from '../config/db.js';
import { sectionService, type SectionWithOccupancy } from '../modules/sections/section.service.js';
import { rankingLockRepository } from '../modules/ranking-locks/ranking-lock.repository.js';
import { rankingRepository } from '../modules/ranking/ranking.repository.js';
import { AppError } from '../utils/appError.js';

/** One entry of the ranked list produced by ranking.engine. */
export interface RankedEntry {
  student_id: string;
  rank_position: number;
  /** numeric from Postgres, so possibly a string */
  total_score?: string | number | null;
  [column: string]: unknown;
}

/** The RETURNING row of a roll assignment UPDATE. */
export interface RollAssignment {
  id: string;
  student_id: string;
  roll_number: number;
  section_id: string | null;
}

export interface GenerateRollsParams {
  rankedList: RankedEntry[];
  classId: string;
  academicSessionId: string;
  sectionId?: string | null;
  lockedBy?: string | null;
}

export interface GenerateRollsResult {
  results: RollAssignment[];
  version: number;
}

// ── Core business logic — assigns roll_number + section by rank, and within the same transaction
//    saves a history snapshot and locks the ranking ──
//
// The whole thing happens in a single DB transaction → if any one of roll, history, or lock fails,
// everything is rolled back (atomicity). A Postgres advisory lock is taken up front, so two jobs for the
// same class+session can never run at the same time (concurrency safety) — the second waits until the first commits.
export const rollEngine = {
  // rankedList = [{ student_id, rank_position, total_score }, ...] — comes from ranking.engine
  // lockedBy: the user id of the admin/system that triggered it — goes into lock + audit
  //
  // The return type is written out rather than inferred: these methods call each other
  // through `this`, and an inferred return would make that circular.
  async generateRolls({
    rankedList,
    classId,
    academicSessionId,
    sectionId = null,
    lockedBy = null,
  }: GenerateRollsParams): Promise<GenerateRollsResult> {
    if (!rankedList.length) {
      throw new AppError('Ranked list is empty — nothing to assign', 400);
    }

    return withTransaction(async (client) => {
      // ── 1. concurrency guard — won't allow two ranking jobs to run at once for the same class+session ──
      // hashtext maps class+session to an int key and a session-scoped advisory lock is taken;
      // the lock releases itself when the transaction commits/rolls back (xact-scoped)
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `ranking:${classId}:${academicSessionId}`,
      ]);

      // ── 2. assign roll_number + section ──
      let results: RollAssignment[];
      if (sectionId) {
        results = await this._assignDirectRoll(client, rankedList, academicSessionId, sectionId);
      } else {
        const sections = await sectionService.getSectionsForDistribution(classId);
        results = !sections.length
          ? await this._assignDirectRoll(client, rankedList, academicSessionId, null)
          : await this._assignWithSectionDistribution(
              client,
              rankedList,
              academicSessionId,
              sections,
            );
      }

      // ── 3. save history snapshot (version = previous MAX + 1) ──
      const version = await this._saveHistory(
        client,
        rankedList,
        results,
        classId,
        academicSessionId,
      );

      // ── 4. ranking lock (document rule: "After rank generation: ranking_locked = true") ──
      await rankingLockRepository.lock(classId, academicSessionId, lockedBy, client);

      // ── 5. audit trail ──
      await rankingRepository.logAudit(
        {
          action: 'GENERATE',
          classId,
          academicSessionId,
          actorId: lockedBy,
          toVersion: version,
          detail: { rankedCount: results.length },
        },
        client,
      );

      return { results, version };
    });
  },

  // Directly assign rank=roll when there's no section or a single section
  async _assignDirectRoll(
    client: PoolClient,
    rankedList: RankedEntry[],
    academicSessionId: string,
    sectionId: string | null,
  ): Promise<RollAssignment[]> {
    const results: RollAssignment[] = [];
    for (const entry of rankedList) {
      const { rows } = await client.query<RollAssignment>(
        `UPDATE student_enrollments
         SET roll_number = $1, section_id = COALESCE($2, section_id), updated_at = NOW()
         WHERE student_id = $3 AND academic_session_id = $4 AND deleted_at IS NULL
         RETURNING id, student_id, roll_number, section_id`,
        [entry.rank_position, sectionId, entry.student_id, academicSessionId],
      );
      if (rows[0]) results.push(rows[0]);
    }
    return results;
  },

  // When Section A fills up then B, then C — filled sequentially by capacity
  // roll_number restarts from 1 separately within each section
  async _assignWithSectionDistribution(
    client: PoolClient,
    rankedList: RankedEntry[],
    academicSessionId: string,
    sections: SectionWithOccupancy[],
  ): Promise<RollAssignment[]> {
    const results: RollAssignment[] = [];
    let sectionIdx = 0;
    let rollInSection = 1;
    let remainingInSection = sections[sectionIdx].available_seats ?? Infinity;

    for (const entry of rankedList) {
      // when the current section is full, move to the next one
      while (remainingInSection <= 0 && sectionIdx < sections.length - 1) {
        sectionIdx++;
        rollInSection = 1;
        remainingInSection = sections[sectionIdx].available_seats ?? Infinity;
      }

      const currentSection = sections[sectionIdx];

      const { rows } = await client.query<RollAssignment>(
        `UPDATE student_enrollments
         SET roll_number = $1, section_id = $2, updated_at = NOW()
         WHERE student_id = $3 AND academic_session_id = $4 AND deleted_at IS NULL
         RETURNING id, student_id, roll_number, section_id`,
        [rollInSection, currentSection.id, entry.student_id, academicSessionId],
      );
      if (rows[0]) results.push(rows[0]);

      rollInSection++;
      remainingInSection--;
    }

    return results;
  },

  // ── computes prev MAX(version)+1 and bulk-inserts the whole ranked list ──
  // total_score comes from rankedList (merit list/ADMISSION → actual score, FIFO student → 0),
  // roll_number comes from the actual assignment result (rank ≠ roll when section-wise)
  async _saveHistory(
    client: PoolClient,
    rankedList: RankedEntry[],
    results: RollAssignment[],
    classId: string,
    academicSessionId: string,
  ): Promise<number> {
    const { rows: vrows } = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next
       FROM ranking_history
       WHERE class_id = $1 AND academic_session_id = $2`,
      [classId, academicSessionId],
    );
    const version = vrows[0].next;

    // student_id → assigned roll_number map (roll differs under section distribution)
    const rollByStudent = new Map(results.map((r) => [r.student_id, r.roll_number]));

    const placeholders: string[] = [];
    const params: unknown[] = [];
    let i = 0;
    for (const entry of rankedList) {
      const rollNumber = rollByStudent.get(entry.student_id);
      if (rollNumber == null) continue; // enrollment wasn't updated (e.g. withdrawn) — don't include in the snapshot

      const b = i * 7;
      placeholders.push(
        `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`,
      );
      params.push(
        academicSessionId,
        classId,
        entry.student_id,
        Number(entry.total_score) || 0,
        entry.rank_position,
        rollNumber,
        version,
      );
      i++;
    }

    if (placeholders.length) {
      await client.query(
        `INSERT INTO ranking_history
           (academic_session_id, class_id, student_id, total_score, rank_position, roll_number, version)
         VALUES ${placeholders.join(', ')}`,
        params,
      );
    }

    return version;
  },
};
