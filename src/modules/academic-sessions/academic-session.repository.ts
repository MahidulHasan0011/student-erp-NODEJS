import type { PoolClient } from 'pg';
import { query } from '../../config/db.js';
import { buildWhereClause, type FilterConfig } from '../../utils/queryBuilder.js';
import { buildOrder } from '../../utils/order.js';
import type { ListQuery, Pagination } from '../../types/common.types.js';
import type { AcademicSessionRow } from '../../types/db.types.js';

export interface CreateAcademicSessionData {
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  admission_test_enabled?: boolean;
}

export interface UpdateAcademicSessionData {
  name?: string;
  start_date?: string | null;
  end_date?: string | null;
}

/** Only these columns may be written by update() — is_active and admission_test_enabled
 *  have their own dedicated methods so the "one active session" rule stays enforceable. */
const ALLOWED_UPDATE_FIELDS = ['name', 'start_date', 'end_date'] as const;

const SORTABLE_FIELDS: Record<string, string> = {
  name: 'name',
  start_date: 'start_date',
  end_date: 'end_date',
  created_at: 'created_at',
};

const FILTER_CONFIG: FilterConfig = {
  searchableColumns: ['name'],
  filterableColumns: [
    { param: 'is_active', column: 'is_active' }, // ?is_active=true
  ],
};

export const academicSessionRepository = {
  async create({
    name,
    start_date,
    end_date,
    admission_test_enabled,
  }: CreateAcademicSessionData): Promise<AcademicSessionRow> {
    const { rows } = await query<AcademicSessionRow>(
      `INSERT INTO academic_sessions (name, start_date, end_date, admission_test_enabled)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, start_date || null, end_date || null, admission_test_enabled ?? true],
    );
    return rows[0];
  },

  async findAll(
    queryOptions: ListQuery,
    { limit, offset }: Pick<Pagination, 'limit' | 'offset'>,
  ): Promise<AcademicSessionRow[]> {
    const values: unknown[] = [];
    const countRef = { value: 1 };

    // buildWhereClause passes filter values through untouched, so this stays a real
    // boolean all the way to pg rather than the string 'true'
    const normalizedQuery: ListQuery = { ...queryOptions };
    if (normalizedQuery.is_active !== undefined) {
      normalizedQuery.is_active = normalizedQuery.is_active === 'true';
    }

    const where = buildWhereClause(normalizedQuery, values, FILTER_CONFIG, countRef);
    const { sortBy, sortOrder } = buildOrder(queryOptions, SORTABLE_FIELDS, 'created_at');

    values.push(limit, offset);
    const limitIdx = countRef.value;
    const offsetIdx = countRef.value + 1;

    const { rows } = await query<AcademicSessionRow>(
      `SELECT * FROM academic_sessions
       ${where}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      values,
    );
    return rows;
  },

  async countAll(queryOptions: ListQuery): Promise<number> {
    const values: unknown[] = [];
    const countRef = { value: 1 };

    const normalizedQuery: ListQuery = { ...queryOptions };
    if (normalizedQuery.is_active !== undefined) {
      normalizedQuery.is_active = normalizedQuery.is_active === 'true';
    }

    const where = buildWhereClause(normalizedQuery, values, FILTER_CONFIG, countRef);
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM academic_sessions ${where}`,
      values,
    );
    return parseInt(rows[0].count);
  },

  async findById(id: string): Promise<AcademicSessionRow | null> {
    const { rows } = await query<AcademicSessionRow>(
      `SELECT * FROM academic_sessions WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] || null;
  },

  async findByName(name: string): Promise<AcademicSessionRow | null> {
    const { rows } = await query<AcademicSessionRow>(
      `SELECT * FROM academic_sessions WHERE name = $1 AND deleted_at IS NULL`,
      [name],
    );
    return rows[0] || null;
  },

  // only one active session may exist at a time
  async findActive(): Promise<AcademicSessionRow | null> {
    const { rows } = await query<AcademicSessionRow>(
      `SELECT * FROM academic_sessions WHERE is_active = true AND deleted_at IS NULL LIMIT 1`,
    );
    return rows[0] || null;
  },

  async update(id: string, fields: UpdateAcademicSessionData): Promise<AcademicSessionRow | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    for (const key of ALLOWED_UPDATE_FIELDS) {
      if (fields[key] !== undefined) {
        params.push(fields[key]);
        setClauses.push(`${key} = $${params.length}`);
      }
    }
    if (!setClauses.length) return null;

    params.push(id);
    const { rows } = await query<AcademicSessionRow>(
      `UPDATE academic_sessions SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length} AND deleted_at IS NULL
       RETURNING *`,
      params,
    );
    return rows[0] || null;
  },

  // deactivate all sessions before activating the new one — the caller (service) runs this in a transaction
  async deactivateAll(client: PoolClient): Promise<void> {
    await client.query(
      `UPDATE academic_sessions SET is_active = false, updated_at = NOW()
       WHERE is_active = true AND deleted_at IS NULL`,
    );
  },

  async setActive(client: PoolClient, id: string): Promise<AcademicSessionRow | null> {
    const { rows } = await client.query<AcademicSessionRow>(
      `UPDATE academic_sessions SET is_active = true, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id],
    );
    return rows[0] || null;
  },

  async toggleAdmissionTest(
    id: string,
    admission_test_enabled: boolean,
  ): Promise<{ id: string; admission_test_enabled: boolean } | null> {
    const { rows } = await query<{ id: string; admission_test_enabled: boolean }>(
      `UPDATE academic_sessions SET admission_test_enabled = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING id, admission_test_enabled`,
      [admission_test_enabled, id],
    );
    return rows[0] || null;
  },

  async softDelete(id: string): Promise<{ id: string } | null> {
    const { rows } = await query<{ id: string }>(
      `UPDATE academic_sessions SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    return rows[0] || null;
  },
};
