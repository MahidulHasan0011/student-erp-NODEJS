import { query } from '../../config/db.js';
import type { RolePermissionRow } from '../../types/db.types.js';

/** findByRoleId — the assignment joined with the permission it grants. */
export interface PermissionOfRoleRow {
  assignment_id: string;
  role_id: string;
  created_at: Date;
  permission_id: string;
  permission_name: string;
}

/** findByPermissionId — the reverse: the assignment joined with the role that holds it. */
export interface RoleOfPermissionRow {
  assignment_id: string;
  permission_id: string;
  created_at: Date;
  role_id: string;
  role_name: string;
}

export const rolePermissionRepository = {
  // All permissions of a specific role — including both id and name
  async findByRoleId(roleId: string): Promise<PermissionOfRoleRow[]> {
    const { rows } = await query<PermissionOfRoleRow>(
      `SELECT rp.id AS assignment_id, rp.role_id, rp.created_at,
              p.id AS permission_id, p.name AS permission_name
            FROM role_permissions rp
            JOIN permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
            WHERE rp.role_id = $1 AND rp.deleted_at IS NULL
            ORDER BY p.name ASC`,
      [roleId],
    );
    return rows;
  },

  // Which roles a specific permission belongs to — the reverse lookup
  async findByPermissionId(permissionId: string): Promise<RoleOfPermissionRow[]> {
    const { rows } = await query<RoleOfPermissionRow>(
      `SELECT rp.id AS assignment_id, rp.permission_id, rp.created_at,
              r.id AS role_id, r.name AS role_name
            FROM role_permissions rp
            JOIN roles r ON r.id = rp.role_id AND r.deleted_at IS NULL
            WHERE rp.permission_id = $1 AND rp.deleted_at IS NULL
            ORDER BY r.name ASC`,
      [permissionId],
    );
    return rows;
  },

  async exists(roleId: string, permissionId: string): Promise<{ id: string } | null> {
    const { rows } = await query<{ id: string }>(
      `
            SELECT id FROM role_permissions
            WHERE role_id = $1 AND permission_id = $2 AND deleted_at IS NULL`,
      [roleId, permissionId],
    );
    return rows[0] || null;
  },

  // Find the row even if soft-deleted — needed for restoring
  async findAny(
    roleId: string,
    permissionId: string,
  ): Promise<{ id: string; deleted_at: Date | null } | null> {
    const { rows } = await query<{ id: string; deleted_at: Date | null }>(
      `SELECT id, deleted_at FROM role_permissions
         WHERE role_id = $1 AND permission_id = $2`,
      [roleId, permissionId],
    );
    return rows[0] || null;
  },

  async create(roleId: string, permissionId: string): Promise<RolePermissionRow> {
    const { rows } = await query<RolePermissionRow>(
      `INSERT INTO role_permissions (role_id, permission_id)
             VALUES ($1, $2) RETURNING *`,
      [roleId, permissionId],
    );
    return rows[0];
  },
  // Restore a previously soft-deleted row — without creating a duplicate row
  async restore(id: string): Promise<RolePermissionRow | null> {
    const { rows } = await query<RolePermissionRow>(
      `UPDATE role_permissions SET deleted_at = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id],
    );
    return rows[0] || null;
  },
  async softDelete(roleId: string, permissionId: string): Promise<{ id: string } | null> {
    const { rows } = await query<{ id: string }>(
      `UPDATE role_permissions SET deleted_at = NOW()
          WHERE role_id = $1 AND permission_id = $2 AND deleted_at IS NULL
          RETURNING id`,
      [roleId, permissionId],
    );
    return rows[0] || null;
  },
};
