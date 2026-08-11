import { query } from '../../config/db.js';
import { buildWhereClause, type FilterConfig } from '../../utils/queryBuilder.js';
import { buildOrder } from '../../utils/order.js';
import type { ListQuery, Pagination } from '../../types/common.types.js';
import type { PermissionRow } from '../../types/db.types.js';

export interface PermissionNameData {
  name: string;
}

// When sortBy=name, the real column name is looked up from this map — to prevent SQL injection
const SORTABLE_FIELDS: Record<string, string> = {
  name: 'name',
  created_at: 'created_at',
};

const FILTER_CONFIG: FilterConfig = {
  searchableColumns: ['name'],
  filterableColumns: [], // no extra filters on permissions
};

export const permissionRepository = {
  async create({ name }: PermissionNameData): Promise<PermissionRow> {
    const { rows } = await query<PermissionRow>(
      `INSERT INTO permissions (name) VALUES ($1) RETURNING *`,
      [name],
    );
    return rows[0];
  },

  // queryOptions = { search, sortBy, sortOrder } coming from req.query
  async findAll(
    queryOptions: ListQuery,
    { limit, offset }: Pick<Pagination, 'limit' | 'offset'>,
  ): Promise<PermissionRow[]> {
    const values: unknown[] = [];
    const countRef = { value: 1 };

    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef);
    const { sortBy, sortOrder } = buildOrder(queryOptions, SORTABLE_FIELDS, 'created_at');

    values.push(limit, offset);
    const limitIdx = countRef.value;
    const offsetIdx = countRef.value + 1;

    const { rows } = await query<PermissionRow>(
      `SELECT * FROM permissions
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
      `SELECT COUNT(*) FROM permissions ${where}`,
      values,
    );
    return parseInt(rows[0].count);
  },

  async findById(id: string): Promise<PermissionRow | null> {
    const { rows } = await query<PermissionRow>(
      `SELECT * FROM permissions WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] || null;
  },

  async findByName(name: string): Promise<PermissionRow | null> {
    const { rows } = await query<PermissionRow>(
      `SELECT * FROM permissions WHERE name = $1 AND deleted_at IS NULL`,
      [name],
    );
    return rows[0] || null;
  },

  async update(id: string, { name }: PermissionNameData): Promise<PermissionRow | null> {
    const { rows } = await query<PermissionRow>(
      `UPDATE permissions SET name = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [name, id],
    );
    return rows[0] || null;
  },

  async delete(id: string): Promise<{ id: string } | null> {
    const { rows } = await query<{ id: string }>(
      `UPDATE permissions SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    return rows[0] || null;
  },

  /** Used to check that every id in a bulk grant actually exists. */
  async findByIds(ids: string[]): Promise<{ id: string }[]> {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM permissions WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [ids],
    );
    return rows;
  },
};
