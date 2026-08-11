import { query } from '../config/db.js';
import { AppError } from '../utils/appError.js';
import { rankingLockRepository } from '../modules/ranking-locks/ranking-lock.repository.js';

/**
 * A row that can take part in ranking.
 *
 * Two different queries feed this and their columns do not line up: the
 * student_merit_list view calls the midterm total `midterm_score`, while the ADMISSION
 * query calls it `mid_score`. _sortAndRank reads both, so both are declared optional
 * here rather than forcing one shape onto the other.
 *
 * The score columns are `string | number` because Postgres SUM()/numeric arrives as a
 * string — see the `num()` helper below.
 */
export interface RankableStudent {
  student_id: string;
  total_score?: string | number | null;
  final_score?: string | number | null;
  /** ADMISSION query spelling */
  mid_score?: string | number | null;
  /** student_merit_list view spelling */
  midterm_score?: string | number | null;
  admission_date?: Date | string | null;
  enrollment_created_at?: Date | string | null;
  [column: string]: unknown;
}

export interface RankedStudent extends RankableStudent {
  rank_position: number;
}

interface FifoRow {
  student_id: string;
  enrollment_id: string;
  admission_date: Date | null;
  created_at: Date;
}

export interface BuildRankingParams {
  classId: string;
  academicSessionId: string;
  admissionTestEnabled: boolean;
  allowWhenLocked?: boolean;
}

// ── Core business logic — knows nothing about HTTP/queue/job, just calculation ──
// This file is called by ranking.job.js.
//
// Scenario 1 (admission_test_enabled = false):
//   OLD student: QUIZ+MID+FINAL merit list rank (from the student_merit_list view)
//   NEW student: FIFO rank by admission_date/created_at, starting after the merit list
//
// Scenario 2 (admission_test_enabled = true):
//   OLD and NEW — both groups merged into a single merit list, ranked by score
//   (OLD score = QUIZ+MID+FINAL, NEW score = ADMISSION)
export const rankingEngine = {
  // Merit list of OLD students for a class+session — from the student_merit_list view
  // (database/views/student_merit_list.sql — sums QUIZ+MID+FINAL and ranks with tie-breaking)
  async calculateOldStudentMeritList(
    classId: string,
    academicSessionId: string,
  ): Promise<RankableStudent[]> {
    const { rows } = await query<RankableStudent>(
      `SELECT * FROM student_merit_list
       WHERE class_id = $1 AND academic_session_id = $2
       ORDER BY rank_position ASC`,
      [classId, academicSessionId],
    );
    return rows;
  },

  // ADMISSION exam scores of NEW students — for merging into the merit list in Scenario 2
  async calculateNewStudentAdmissionScores(
    classId: string,
    academicSessionId: string,
  ): Promise<RankableStudent[]> {
    const { rows } = await query<RankableStudent>(
      `SELECT
         er.student_id,
         s.student_code,
         u.full_name AS student_name,
         se.admission_date,
         se.created_at AS enrollment_created_at,
         SUM(er.marks) AS total_score,
         0 AS final_score,
         0 AS mid_score
       FROM exam_results er
       JOIN exams e ON e.id = er.exam_id
       JOIN students s ON s.id = er.student_id
       JOIN users u ON u.id = s.user_id
       JOIN student_enrollments se
         ON se.student_id = er.student_id
         AND se.academic_session_id = e.academic_session_id
         AND se.deleted_at IS NULL
       WHERE e.class_id = $1
         AND e.academic_session_id = $2
         AND e.exam_type = 'ADMISSION'
         AND e.status = 'PUBLISHED'
         AND er.deleted_at IS NULL
         AND e.deleted_at IS NULL
         AND s.deleted_at IS NULL
       GROUP BY er.student_id, s.student_code, u.full_name, se.admission_date, se.created_at`,
      [classId, academicSessionId],
    );
    return rows;
  },

  // ── deterministic sort — the document's 5-step tie-breaking rule is re-applied here
  // (in Scenario 2, ranks must be re-assigned after merging OLD+NEW, so the sort logic is needed here) ──
  _sortAndRank(students: RankableStudent[]): RankedStudent[] {
    // Postgres numeric/SUM comes as a string — it must be passed through Number() before comparing,
    // and the merit-view gives "midterm_score" while admission rows give "mid_score" — handle both
    const num = (v: unknown): number => Number(v) || 0;
    const finalOf = (r: RankableStudent): number => num(r.final_score);
    const midOf = (r: RankableStudent): number => num(r.mid_score ?? r.midterm_score);

    const sorted = [...students].sort((a, b) => {
      if (num(b.total_score) !== num(a.total_score)) return num(b.total_score) - num(a.total_score);
      if (finalOf(b) !== finalOf(a)) return finalOf(b) - finalOf(a);
      if (midOf(b) !== midOf(a)) return midOf(b) - midOf(a);

      const aAdm = a.admission_date ? new Date(a.admission_date).getTime() : Infinity;
      const bAdm = b.admission_date ? new Date(b.admission_date).getTime() : Infinity;
      if (aAdm !== bAdm) return aAdm - bAdm;

      const aCreated = new Date(a.enrollment_created_at as Date).getTime();
      const bCreated = new Date(b.enrollment_created_at as Date).getTime();
      if (aCreated !== bCreated) return aCreated - bCreated;

      return a.student_id < b.student_id ? -1 : a.student_id > b.student_id ? 1 : 0;
    });

    return sorted.map((row, index) => ({ ...row, rank_position: index + 1 }));
  },

  // FIFO rank by admission_date/created_at for NEW students of a class + session
  // (those with no admission result, roll_number still null) — rank starts from the number after the merit list
  async calculateFifoRanking(
    classId: string,
    academicSessionId: string,
    startRank: number,
  ): Promise<RankedStudent[]> {
    const { rows } = await query<FifoRow>(
      `SELECT
         se.student_id,
         se.id AS enrollment_id,
         se.admission_date,
         se.created_at
       FROM student_enrollments se
       WHERE se.class_id = $1
         AND se.academic_session_id = $2
         AND se.roll_number IS NULL
         AND se.deleted_at IS NULL
       ORDER BY se.admission_date ASC, se.created_at ASC`,
      [classId, academicSessionId],
    );

    // FIFO students have no exam score → total_score = 0 (needed for the history snapshot)
    return rows.map((row, index) => ({
      ...row,
      total_score: 0,
      rank_position: startRank + index,
    }));
  },

  // ── main entry point — builds the correct ranking per Scenario 1/2 and passes it to roll.engine.js ──
  // important rule: ranking/roll only runs once the FINAL exam is published (the caller checks this beforehand)
  //
  // when allowWhenLocked = true the lock check is skipped — only the RECALCULATE_RANKING manual
  // flow uses this (step 6), where the admin has already explicitly unlocked and started this flow.
  // The normal auto-trigger never passes this flag as true.
  async buildCombinedRanking({
    classId,
    academicSessionId,
    admissionTestEnabled,
    allowWhenLocked = false,
  }: BuildRankingParams): Promise<RankableStudent[]> {
    if (!allowWhenLocked) {
      const locked = await rankingLockRepository.isLocked(classId, academicSessionId);
      if (locked) {
        throw new AppError(
          'Ranking is locked for this class & session. An administrator must unlock it before recalculating.',
          409,
        );
      }
    }

    const oldMeritList = await this.calculateOldStudentMeritList(classId, academicSessionId);

    if (!admissionTestEnabled) {
      // ── Scenario 1 ── OLD ranked, NEW FIFO afterwards
      if (!oldMeritList.length) {
        throw new AppError(
          'No published FINAL results found for this class — cannot calculate ranking',
          404,
        );
      }
      const nextRank = oldMeritList.length + 1;
      const fifoList = await this.calculateFifoRanking(classId, academicSessionId, nextRank);
      return [...oldMeritList, ...fifoList];
    }

    // ── Scenario 2 ── merge OLD + NEW into a single merit list, ranked by score
    const newAdmissionScores = await this.calculateNewStudentAdmissionScores(
      classId,
      academicSessionId,
    );

    const combined = [...oldMeritList, ...newAdmissionScores];
    if (!combined.length) {
      throw new AppError(
        'No published results found (FINAL or ADMISSION) — cannot calculate ranking',
        404,
      );
    }

    return this._sortAndRank(combined);
  },
};
