import { query } from '../../config/db.js';
import { buildWhereClause, type FilterConfig } from '../../utils/queryBuilder.js';
import { buildOrder } from '../../utils/order.js';
import type { ListQuery, Pagination } from '../../types/common.types.js';
import type { SubjectRow } from '../../types/db.types.js';

export interface CreateSubjectData {
  name: string;
  code?: string | null;
}

/** Both optional — update() only writes the fields that are present. */
export interface UpdateSubjectData {
  name?: string;
  code?: string | null;
}

const SORTABLE_FIELDS: Record<string, string> = {
  name: 'name',
  code: 'code',
  created_at: 'created_at',
};

const FILTER_CONFIG: FilterConfig = {
  searchableColumns: ['name', 'code'],
  filterableColumns: [],
};

export const subjectRepository = {
  async create({ name, code }: CreateSubjectData): Promise<SubjectRow> {
    const { rows } = await query<SubjectRow>(
      `INSERT INTO subjects (name, code) VALUES ($1, $2) RETURNING *`,
      [name, code || null],
    );
    return rows[0];
  },

  async findAll(
    queryOptions: ListQuery,
    { limit, offset }: Pick<Pagination, 'limit' | 'offset'>,
  ): Promise<SubjectRow[]> {
    const values: unknown[] = [];
    const countRef = { value: 1 };

    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef);
    const { sortBy, sortOrder } = buildOrder(queryOptions, SORTABLE_FIELDS, 'name');

    values.push(limit, offset);
    const limitIdx = countRef.value;
    const offsetIdx = countRef.value + 1;

    const { rows } = await query<SubjectRow>(
      `SELECT * FROM subjects
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
    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef);
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM subjects ${where}`,
      values,
    );
    return parseInt(rows[0].count);
  },

  async findById(id: string): Promise<SubjectRow | null> {
    const { rows } = await query<SubjectRow>(
      `SELECT * FROM subjects WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] || null;
  },

  async findByName(name: string): Promise<SubjectRow | null> {
    const { rows } = await query<SubjectRow>(
      `SELECT * FROM subjects WHERE name = $1 AND deleted_at IS NULL`,
      [name],
    );
    return rows[0] || null;
  },

  async findByCode(code: string): Promise<SubjectRow | null> {
    const { rows } = await query<SubjectRow>(
      `SELECT * FROM subjects WHERE code = $1 AND deleted_at IS NULL`,
      [code],
    );
    return rows[0] || null;
  },

  async update(id: string, { name, code }: UpdateSubjectData): Promise<SubjectRow | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (name !== undefined) {
      params.push(name);
      setClauses.push(`name = $${params.length}`);
    }
    if (code !== undefined) {
      params.push(code);
      setClauses.push(`code = $${params.length}`);
    }
    if (!setClauses.length) return null;

    params.push(id);
    const { rows } = await query<SubjectRow>(
      `UPDATE subjects SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length} AND deleted_at IS NULL
       RETURNING *`,
      params,
    );
    return rows[0] || null;
  },

  async softDelete(id: string): Promise<{ id: string } | null> {
    const { rows } = await query<{ id: string }>(
      `UPDATE subjects SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    return rows[0] || null;
  },

  async isAssignedToTeacher(id: string): Promise<boolean> {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM subject_assignments WHERE subject_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    return rows.length > 0;
  },
};
