import { query } from '../../config/db.js';
import type { UserRow } from '../../types/db.types.js';

/** findByEmail selects u.* — password included, because login has to compare it. */
export interface AuthUserRow extends UserRow {
  /** LEFT JOIN on roles */
  role_name: string | null;
}

/** findById is the safe projection — no password column. */
export interface AuthSafeUserRow extends Pick<
  UserRow,
  'id' | 'full_name' | 'email' | 'role_id' | 'is_active' | 'gender' | 'created_at'
> {
  role_name: string | null;
}

export const authRepository = {
  async findByEmail(email: string): Promise<AuthUserRow | null> {
    const { rows } = await query<AuthUserRow>(
      `SELECT u.*, r.name AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [email],
    );
    return rows[0] || null;
  },
  async findById(id: string): Promise<AuthSafeUserRow | null> {
    const { rows } = await query<AuthSafeUserRow>(
      `SELECT u.id, u.full_name, u.email, u.role_id, u.is_active,
              u.gender, u.created_at, r.name AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [id],
    );
    return rows[0] || null;
  },
};
