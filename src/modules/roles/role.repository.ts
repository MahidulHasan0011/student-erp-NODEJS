import { query, withTransaction } from '../../config/db.js';
import { buildWhereClause, type FilterConfig } from '../../utils/queryBuilder.js';
import { buildOrder } from '../../utils/order.js';
import type { ListQuery, Pagination } from '../../types/common.types.js';
import type { RoleRow } from '../../types/db.types.js';

/** One element of the json_agg'd permissions array. */
export interface RolePermissionSummary {
  id: string;
  name: string;
}

/** findAll/findById also aggregate the role's permissions into json. */
export interface RoleWithPermissionsRow extends RoleRow {
  permissions: RolePermissionSummary[];
}

export interface RoleNameData {
  name: string;
}

// There is a JOIN, so alias "r" — must pass baseAlias="r" to buildWhereClause
const SORTABLE_FIELDS: Record<string, string> = {
  name: 'r.name',
  created_at: 'r.created_at',
};

const FILTER_CONFIG: FilterConfig = {
  searchableColumns: ['r.name'],
  filterableColumns: [],
};

export const roleRepository = {
  async create({ name }: RoleNameData): Promise<RoleRow> {
    const { rows } = await query<RoleRow>(`INSERT INTO roles (name) VALUES ($1) RETURNING *`, [
      name,
    ]);
    return rows[0];
  },

  async findAll(
    queryOptions: ListQuery,
    { limit, offset }: Pick<Pagination, 'limit' | 'offset'>,
  ): Promise<RoleWithPermissionsRow[]> {
    const values: unknown[] = [];
    const countRef = { value: 1 };

    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef, 'r');
    const { sortBy, sortOrder } = buildOrder(queryOptions, SORTABLE_FIELDS, 'created_at');

    values.push(limit, offset);
    const limitIdx = countRef.value;
    const offsetIdx = countRef.value + 1;

    const { rows } = await query<RoleWithPermissionsRow>(
      `SELECT r.*,
         COALESCE(json_agg(
           json_build_object('id', p.id, 'name', p.name)
         ) FILTER (WHERE p.id IS NOT NULL), '[]') AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id AND rp.deleted_at IS NULL
       LEFT JOIN permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
       ${where}
       GROUP BY r.id
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      values,
    );
    return rows;
  },

  async countAll(queryOptions: ListQuery): Promise<number> {
    const values: unknown[] = [];
    const countRef = { value: 1 };
    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef, 'r');

    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM roles r ${where}`,
      values,
    );
    return parseInt(rows[0].count);
  },

  async findById(id: string): Promise<RoleWithPermissionsRow | null> {
    const { rows } = await query<RoleWithPermissionsRow>(
      `SELECT r.*,
         COALESCE(json_agg(
           json_build_object('id', p.id, 'name', p.name)
         ) FILTER (WHERE p.id IS NOT NULL), '[]') AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id AND rp.deleted_at IS NULL
       LEFT JOIN permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
       WHERE r.id = $1 AND r.deleted_at IS NULL
       GROUP BY r.id`,
      [id],
    );
    return rows[0] || null;
  },

  async findByName(name: string): Promise<RoleRow | null> {
    const { rows } = await query<RoleRow>(
      `SELECT * FROM roles WHERE name = $1 AND deleted_at IS NULL`,
      [name],
    );
    return rows[0] || null;
  },

  async update(id: string, { name }: RoleNameData): Promise<RoleRow | null> {
    const { rows } = await query<RoleRow>(
      `UPDATE roles SET name = $1, updated_at = NOW()
    WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [name, id],
    );
    return rows[0] || null;
  },
  async syncPermissions(roleId: string, permissionIds: string[]): Promise<void> {
    return withTransaction(async (client) => {
      await client.query(
        `UPDATE role_permissions SET deleted_at = NOW()
         WHERE role_id = $1 AND deleted_at IS NULL`,
        [roleId],
      );
      if (!permissionIds.length) return;
      const values = permissionIds.map((_, i) => `($1, $${i + 2})`).join(', ');
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ${values}
         ON CONFLICT (role_id, permission_id) DO UPDATE SET deleted_at = NULL, updated_at = NOW()`,
        [roleId, ...permissionIds],
      );
    });
  },

  async getPermissionNames(roleId: string): Promise<string[]> {
    const { rows } = await query<{ name: string }>(
      `SELECT p.name FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = $1 AND rp.deleted_at IS NULL AND p.deleted_at IS NULL`,
      [roleId],
    );
    return rows.map((r) => r.name);
  },

  async softDelete(id: string): Promise<{ id: string } | null> {
    const { rows } = await query<{ id: string }>(
      `UPDATE roles SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    return rows[0] || null;
  },
};
