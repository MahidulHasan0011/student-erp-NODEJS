import { query } from '../../config/db.js';
import { buildWhereClause, type FilterConfig } from '../../utils/queryBuilder.js';
import { buildOrder } from '../../utils/order.js';
import type { ListQuery, Pagination } from '../../types/common.types.js';
import type { Gender, UserRow } from '../../types/db.types.js';

/** The SAFE_COLUMNS projection — everything except users.password. */
export interface UserListRow extends Pick<
  UserRow,
  'id' | 'full_name' | 'email' | 'role_id' | 'is_active' | 'gender' | 'created_at' | 'updated_at'
> {
  /** LEFT JOIN on roles — null when the user has no role */
  role_name: string | null;
}

/** update() returns a narrower set of columns than findById. */
export type UpdatedUserRow = Pick<
  UserRow,
  'id' | 'full_name' | 'email' | 'role_id' | 'is_active' | 'gender' | 'updated_at'
>;

export interface CreateUserData {
  full_name: string;
  email: string;
  /** already hashed by the service */
  password: string;
  role_id: string;
  gender?: Gender;
}

export interface UpdateUserData {
  full_name?: string;
  email?: string;
  role_id?: string;
  gender?: Gender;
}

/** Only these columns may be written by update(). */
const ALLOWED_UPDATE_FIELDS = ['full_name', 'email', 'role_id', 'gender'] as const;

const SAFE_COLUMNS = `
  u.id, u.full_name, u.email, u.role_id, u.is_active,
  u.gender, u.created_at, u.updated_at,
  r.name AS role_name
`;

// has a JOIN — alias "u"
const SORTABLE_FIELDS: Record<string, string> = {
  full_name: 'u.full_name',
  email: 'u.email',
  created_at: 'u.created_at',
};

const FILTER_CONFIG: FilterConfig = {
  searchableColumns: ['u.full_name', 'u.email'],
  filterableColumns: [
    { param: 'role_id', column: 'u.role_id' }, // ?role_id=...
    { param: 'is_active', column: 'u.is_active' }, // ?is_active=true
  ],
};

export const userRepository = {
  async create({ full_name, email, password, role_id, gender }: CreateUserData): Promise<UserRow> {
    const { rows } = await query<UserRow>(
      `INSERT INTO users (full_name, email, password, role_id, gender)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
      [full_name, email, password, role_id, gender || 'MALE'],
    );
    return rows[0];
  },

  async findAll(
    queryOptions: ListQuery,
    { limit, offset }: Pick<Pagination, 'limit' | 'offset'>,
  ): Promise<UserListRow[]> {
    const values: unknown[] = [];
    const countRef = { value: 1 };

    // is_active comes in as a string ("true"/"false") — must be converted to a boolean.
    // buildWhereClause deliberately does not stringify filter values, so this boolean
    // survives all the way to pg as a real boolean parameter.
    const normalizedQuery: ListQuery = { ...queryOptions };
    if (normalizedQuery.is_active !== undefined) {
      normalizedQuery.is_active = normalizedQuery.is_active === 'true';
    }

    const where = buildWhereClause(normalizedQuery, values, FILTER_CONFIG, countRef, 'u');
    const { sortBy, sortOrder } = buildOrder(queryOptions, SORTABLE_FIELDS, 'created_at');

    values.push(limit, offset);
    const limitIdx = countRef.value;
    const offsetIdx = countRef.value + 1;

    const { rows } = await query<UserListRow>(
      `SELECT ${SAFE_COLUMNS}
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
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
    const where = buildWhereClause(normalizedQuery, values, FILTER_CONFIG, countRef, 'u');

    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         ${where}`,
      values,
    );
    return parseInt(rows[0].count);
  },

  async findById(id: string): Promise<UserListRow | null> {
    const { rows } = await query<UserListRow>(
      `SELECT ${SAFE_COLUMNS}
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [id],
    );
    return rows[0] || null;
  },

  async findByEmail(email: string): Promise<{ id: string; email: string } | null> {
    const { rows } = await query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email],
    );
    return rows[0] || null;
  },

  async findWithPassword(id: string): Promise<{ id: string; password: string } | null> {
    const { rows } = await query<{ id: string; password: string }>(
      `SELECT id, password FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] || null;
  },

  async update(id: string, fields: UpdateUserData): Promise<UpdatedUserRow | null> {
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
    const { rows } = await query<UpdatedUserRow>(
      `UPDATE users SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length} AND deleted_at IS NULL
       RETURNING id, full_name, email, role_id, is_active, gender, updated_at`,
      params,
    );
    return rows[0] || null;
  },

  async updatePassword(id: string, hashedPassword: string): Promise<void> {
    await query(`UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2`, [
      hashedPassword,
      id,
    ]);
  },

  async toggleActive(
    id: string,
    is_active: boolean,
  ): Promise<{ id: string; is_active: boolean } | null> {
    const { rows } = await query<{ id: string; is_active: boolean }>(
      `UPDATE users SET is_active = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL RETURNING id, is_active`,
      [is_active, id],
    );
    return rows[0] || null;
  },

  async softDelete(id: string): Promise<{ id: string } | null> {
    const { rows } = await query<{ id: string }>(
      `UPDATE users SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    return rows[0] || null;
  },
};
