import type { PoolClient } from 'pg';
import { query } from '../../config/db.js';
import type { RankingAction, RankingAuditLogRow } from '../../types/db.types.js';

/** One row of a ranking snapshot, joined with the student's name and code. */
export interface RankingSnapshotRow {
  student_id: string;
  student_code: string;
  student_name: string;
  /** numeric(7,2) → string */
  total_score: string;
  rank_position: number;
  roll_number: number;
  version: number;
  generated_at: Date;
}

/** getVersions — one entry per generated version. */
export interface RankingVersionRow {
  version: number;
  generated_at: Date;
  /** COUNT(*) is a bigint → string */
  student_count: string;
}

export interface AuditLogEntry extends RankingAuditLogRow {
  /** LEFT JOIN — null when the action was taken by the system */
  actor_name: string | null;
}

export interface LogAuditParams {
  action: RankingAction;
  classId: string;
  academicSessionId: string;
  actorId?: string | null;
  fromVersion?: number | null;
  toVersion?: number | null;
  detail?: unknown;
}

const SNAPSHOT_COLUMNS = `
  rh.student_id,
  s.student_code,
  u.full_name AS student_name,
  rh.total_score,
  rh.rank_position,
  rh.roll_number,
  rh.version,
  rh.generated_at
`;

// ── Ranking module read queries + writing the audit log ──
// logAudit is called from inside the roll.engine transaction (by passing a client),
// and can also be called directly from the service (without a client → pool query)
export const rankingRepository = {
  // the latest version's snapshot for a class+session — this is the "current ranking"
  // (we read the authoritative history snapshot instead of live student_enrollments.roll_number,
  //  because rank_position + total_score are kept together here)
  async getCurrentRanking(
    classId: string,
    academicSessionId: string,
  ): Promise<RankingSnapshotRow[]> {
    const { rows } = await query<RankingSnapshotRow>(
      `WITH latest AS (
         SELECT MAX(version) AS v
         FROM ranking_history
         WHERE class_id = $1 AND academic_session_id = $2
       )
       SELECT ${SNAPSHOT_COLUMNS}
       FROM ranking_history rh
       JOIN latest l ON rh.version = l.v
       JOIN students s ON s.id = rh.student_id
       JOIN users u ON u.id = s.user_id
       WHERE rh.class_id = $1 AND rh.academic_session_id = $2
       ORDER BY rh.rank_position ASC`,
      [classId, academicSessionId],
    );
    return rows;
  },

  // snapshot for a specific version (or all versions if none given) — for the history viewer
  async getHistory(
    classId: string,
    academicSessionId: string,
    version: number | null = null,
  ): Promise<RankingSnapshotRow[]> {
    const params: unknown[] = [classId, academicSessionId];
    let versionFilter = '';
    if (version != null) {
      params.push(version);
      versionFilter = `AND rh.version = $3`;
    }
    const { rows } = await query<RankingSnapshotRow>(
      `SELECT ${SNAPSHOT_COLUMNS}
       FROM ranking_history rh
       JOIN students s ON s.id = rh.student_id
       JOIN users u ON u.id = s.user_id
       WHERE rh.class_id = $1 AND rh.academic_session_id = $2 ${versionFilter}
       ORDER BY rh.version DESC, rh.rank_position ASC`,
      params,
    );
    return rows;
  },

  // which versions exist — to build the history dropdown
  async getVersions(classId: string, academicSessionId: string): Promise<RankingVersionRow[]> {
    const { rows } = await query<RankingVersionRow>(
      `SELECT version, MIN(generated_at) AS generated_at, COUNT(*) AS student_count
       FROM ranking_history
       WHERE class_id = $1 AND academic_session_id = $2
       GROUP BY version
       ORDER BY version DESC`,
      [classId, academicSessionId],
    );
    return rows;
  },

  // ── writing the audit trail ──
  // if a client is passed it becomes part of the ongoing transaction (atomic), otherwise a separate pool query
  //
  // The client branch replaces `client.query.bind(client)`; binding an overloaded method
  // erases its generic, so the row type could not be threaded through.
  async logAudit(
    {
      action,
      classId,
      academicSessionId,
      actorId = null,
      fromVersion = null,
      toVersion = null,
      detail = null,
    }: LogAuditParams,
    client: PoolClient | null = null,
  ): Promise<RankingAuditLogRow> {
    const sql = `INSERT INTO ranking_audit_log
         (action, class_id, academic_session_id, actor_id, from_version, to_version, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`;
    const params = [
      action,
      classId,
      academicSessionId,
      actorId,
      fromVersion,
      toVersion,
      detail ? JSON.stringify(detail) : null,
    ];
    const { rows } = client
      ? await client.query<RankingAuditLogRow>(sql, params)
      : await query<RankingAuditLogRow>(sql, params);
    return rows[0];
  },

  async getAuditLog(
    classId: string,
    academicSessionId: string,
    limit = 50,
  ): Promise<AuditLogEntry[]> {
    const { rows } = await query<AuditLogEntry>(
      `SELECT al.*, u.full_name AS actor_name
       FROM ranking_audit_log al
       LEFT JOIN users u ON u.id = al.actor_id
       WHERE al.class_id = $1 AND al.academic_session_id = $2
       ORDER BY al.created_at DESC
       LIMIT $3`,
      [classId, academicSessionId, limit],
    );
    return rows;
  },
};
