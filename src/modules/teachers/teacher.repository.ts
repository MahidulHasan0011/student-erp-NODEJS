import type { PoolClient } from 'pg';
import { query } from '../../config/db.js';
import { buildWhereClause, type FilterConfig } from '../../utils/queryBuilder.js';
import { buildOrder } from '../../utils/order.js';
import type { ListQuery, Pagination } from '../../types/common.types.js';
import type { Gender, TeacherRow, UserRow } from '../../types/db.types.js';

/** The SAFE_COLUMNS projection — teacher columns joined with the safe user columns. */
export interface TeacherListRow
  extends
    Pick<
      TeacherRow,
      | 'id'
      | 'user_id'
      | 'phone'
      | 'designation'
      | 'qualification'
      | 'joining_date'
      | 'created_at'
      | 'updated_at'
    >,
    Pick<UserRow, 'full_name' | 'email' | 'gender' | 'is_active'> {}

/** findAssignments — the assignment joined with every name it references. */
export interface TeacherAssignmentRow {
  id: string;
  class_id: string | null;
  class_name: string;
  section_id: string | null;
  /** LEFT JOIN — an assignment need not be section-specific */
  section_name: string | null;
  subject_id: string | null;
  subject_name: string;
  academic_session_id: string | null;
  session_name: string;
}

export interface CreateUserData {
  full_name: string;
  email: string;
  /** already hashed by the service */
  password: string;
  role_id: string;
  gender?: Gender;
}

export interface CreateTeacherProfileData {
  user_id: string;
  phone?: string | null;
  designation?: string | null;
  qualification?: string | null;
  joining_date?: string | null;
}

export interface UpdateTeacherData {
  phone?: string | null;
  designation?: string | null;
  qualification?: string | null;
  joining_date?: string | null;
}

/** the only columns update() will SET — exported so the service can guard an empty PATCH */
export const ALLOWED_UPDATE_FIELDS = [
  'phone',
  'designation',
  'qualification',
  'joining_date',
] as const;

const SAFE_COLUMNS = `
  t.id, t.user_id, t.phone, t.designation, t.qualification, t.joining_date,
  t.created_at, t.updated_at,
  u.full_name, u.email, u.gender, u.is_active
`;

const SORTABLE_FIELDS: Record<string, string> = {
  full_name: 'u.full_name',
  joining_date: 't.joining_date',
  created_at: 't.created_at',
};

const FILTER_CONFIG: FilterConfig = {
  searchableColumns: ['u.full_name', 'u.email', 't.phone'],
  filterableColumns: [],
};

export const teacherRepository = {
  // Create user + teacher together — the caller handles the transaction (service layer)
  async createUser(
    client: PoolClient,
    { full_name, email, password, role_id, gender }: CreateUserData,
  ): Promise<{ id: string }> {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO users (full_name, email, password, role_id, gender)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [full_name, email, password, role_id, gender || 'MALE'],
    );
    return rows[0];
  },

  async createTeacherProfile(
    client: PoolClient,
    { user_id, phone, designation, qualification, joining_date }: CreateTeacherProfileData,
  ): Promise<TeacherRow> {
    const { rows } = await client.query<TeacherRow>(
      `INSERT INTO teachers (user_id, phone, designation, qualification, joining_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, phone || null, designation || null, qualification || null, joining_date || null],
    );
    return rows[0];
  },

  async findAll(
    queryOptions: ListQuery,
    { limit, offset }: Pick<Pagination, 'limit' | 'offset'>,
  ): Promise<TeacherListRow[]> {
    const values: unknown[] = [];
    const countRef = { value: 1 };

    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef, 't');
    const { sortBy, sortOrder } = buildOrder(queryOptions, SORTABLE_FIELDS, 'created_at');

    values.push(limit, offset);
    const limitIdx = countRef.value;
    const offsetIdx = countRef.value + 1;

    const { rows } = await query<TeacherListRow>(
      `SELECT ${SAFE_COLUMNS}
       FROM teachers t
       JOIN users u ON u.id = t.user_id
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
    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef, 't');
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM teachers t JOIN users u ON u.id = t.user_id ${where}`,
      values,
    );
    return parseInt(rows[0].count);
  },

  async findById(id: string): Promise<TeacherListRow | null> {
    const { rows } = await query<TeacherListRow>(
      `SELECT ${SAFE_COLUMNS}
       FROM teachers t
       JOIN users u ON u.id = t.user_id
       WHERE t.id = $1 AND t.deleted_at IS NULL`,
      [id],
    );
    return rows[0] || null;
  },

  async findByUserId(user_id: string): Promise<TeacherRow | null> {
    const { rows } = await query<TeacherRow>(
      `SELECT * FROM teachers WHERE user_id = $1 AND deleted_at IS NULL`,
      [user_id],
    );
    return rows[0] || null;
  },

  // All of the teacher's subject assignments (for the active session) — to show with the profile
  async findAssignments(teacherId: string): Promise<TeacherAssignmentRow[]> {
    const { rows } = await query<TeacherAssignmentRow>(
      `SELECT
         sa.id, sa.class_id, c.name AS class_name,
         sa.section_id, sec.name AS section_name,
         sa.subject_id, sub.name AS subject_name,
         sa.academic_session_id, asess.name AS session_name
       FROM subject_assignments sa
       JOIN classes c ON c.id = sa.class_id
       LEFT JOIN sections sec ON sec.id = sa.section_id
       JOIN subjects sub ON sub.id = sa.subject_id
       JOIN academic_sessions asess ON asess.id = sa.academic_session_id
       WHERE sa.teacher_id = $1 AND sa.deleted_at IS NULL
       ORDER BY c.name, sec.name`,
      [teacherId],
    );
    return rows;
  },

  async update(id: string, inputData: UpdateTeacherData): Promise<TeacherRow | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    for (const key of ALLOWED_UPDATE_FIELDS) {
      if (inputData[key] !== undefined) {
        params.push(inputData[key]);
        setClauses.push(`${key} = $${params.length}`);
      }
    }
    if (!setClauses.length) return null;

    params.push(id);
    const { rows } = await query<TeacherRow>(
      `UPDATE teachers SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length} AND deleted_at IS NULL
       RETURNING *`,
      params,
    );
    return rows[0] || null;
  },

  async softDelete(id: string): Promise<{ id: string; user_id: string | null } | null> {
    const { rows } = await query<{ id: string; user_id: string | null }>(
      `UPDATE teachers SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id, user_id`,
      [id],
    );
    return rows[0] || null;
  },

  async hasActiveAssignments(teacherId: string): Promise<boolean> {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM subject_assignments WHERE teacher_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [teacherId],
    );
    return rows.length > 0;
  },
};
