import type { PoolClient } from 'pg';
import { query } from '../../config/db.js';
import type { RankingLockRow } from '../../types/db.types.js';

const LOCK_SQL = `
  INSERT INTO ranking_locks (class_id, academic_session_id, is_locked, locked_at, locked_by)
  VALUES ($1, $2, true, NOW(), $3)
  ON CONFLICT (class_id, academic_session_id)
  DO UPDATE SET is_locked = true, locked_at = NOW(), locked_by = $3, updated_at = NOW()
  RETURNING *`;

const UNLOCK_SQL = `
  INSERT INTO ranking_locks (class_id, academic_session_id, is_locked, locked_at, locked_by)
  VALUES ($1, $2, false, NULL, NULL)
  ON CONFLICT (class_id, academic_session_id)
  DO UPDATE SET is_locked = false, locked_at = NULL, locked_by = NULL, updated_at = NOW()
  RETURNING *`;

/**
 * Run on the caller's transaction client when there is one, otherwise on the pool.
 *
 * Replaces the previous `client ? client.query.bind(client) : query` — binding an
 * overloaded method erases its generic, so the row type could not be threaded through.
 * The branch is the same decision, just made at the call instead of on the function.
 */
const run = (client: PoolClient | null, sql: string, params: unknown[]) =>
  client ? client.query<RankingLockRow>(sql, params) : query<RankingLockRow>(sql, params);

export const rankingLockRepository = {
  // whether a lock status exists for the class+session — if not, it's assumed unlocked (first time)
  async findByClassAndSession(
    classId: string,
    academicSessionId: string,
  ): Promise<RankingLockRow | null> {
    const { rows } = await query<RankingLockRow>(
      `SELECT * FROM ranking_locks
       WHERE class_id = $1 AND academic_session_id = $2`,
      [classId, academicSessionId],
    );
    return rows[0] || null;
  },

  async isLocked(classId: string, academicSessionId: string): Promise<boolean> {
    const lock = await this.findByClassAndSession(classId, academicSessionId);
    return lock?.is_locked === true;
  },

  // creates and locks the row if no lock row exists, updates it if it does — upsert pattern
  // if a client is passed it becomes part of the roll.engine's ongoing transaction (roll+history+lock atomic)
  async lock(
    classId: string,
    academicSessionId: string,
    lockedBy?: string | null,
    client: PoolClient | null = null,
  ): Promise<RankingLockRow> {
    const { rows } = await run(client, LOCK_SQL, [classId, academicSessionId, lockedBy || null]);
    return rows[0];
  },

  async unlock(
    classId: string,
    academicSessionId: string,
    client: PoolClient | null = null,
  ): Promise<RankingLockRow> {
    const { rows } = await run(client, UNLOCK_SQL, [classId, academicSessionId]);
    return rows[0];
  },
};
