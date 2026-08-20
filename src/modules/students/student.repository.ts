import type { PoolClient } from 'pg';
import { query } from '../../config/db.js';
import { buildWhereClause, type FilterConfig } from '../../utils/queryBuilder.js';
import { buildOrder } from '../../utils/order.js';
import type { ListQuery, Pagination } from '../../types/common.types.js';
import type { StudentRow, UserRow } from '../../types/db.types.js';

/**
 * The SAFE_COLUMNS projection — student columns joined with the safe user columns.
 * Built with Pick<> from the table rows so it cannot drift from the schema; note it
 * deliberately excludes both users.password and deleted_at.
 */
export interface StudentListRow
  extends
    Pick<
      StudentRow,
      | 'id'
      | 'student_code'
      | 'date_of_birth'
      | 'guardian_name'
      | 'guardian_phone'
      | 'address'
      | 'user_id'
      | 'created_at'
      | 'updated_at'
    >,
    Pick<UserRow, 'full_name' | 'email' | 'gender' | 'is_active'> {}

/** findCurrentEnrollment — enrollment joined with class / section / session names. */
export interface CurrentEnrollmentRow {
  enrollment_id: string;
  roll_number: number | null;
  class_id: string | null;
  class_name: string;
  section_id: string | null;
  /** LEFT JOIN — null when the student has no section yet */
  section_name: string | null;
  academic_session_id: string | null;
  session_name: string;
}

export interface CreateUserData {
  full_name: string;
  email: string;
  /** already bcrypt-hashed by the service */
  password: string;
  role_id: string;
  gender?: string;
}

export interface CreateStudentProfileData {
  user_id: string;
  student_code: string;
  date_of_birth?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  address?: string | null;
}

export interface UpdateStudentData {
  date_of_birth?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  address?: string | null;
}

/** Only these columns may be written by update() — the allow-list is the SET clause.
 *  Exported so the service can reject an empty PATCH before it reaches that clause. */
export const ALLOWED_UPDATE_FIELDS = [
  'date_of_birth',
  'guardian_name',
  'guardian_phone',
  'address',
] as const;

const SAFE_COLUMNS = `
  s.id, s.student_code, s.date_of_birth, s.guardian_name, s.guardian_phone,
  s.address, s.user_id, s.created_at, s.updated_at,
  u.full_name, u.email, u.gender, u.is_active
`;

const SORTABLE_FIELDS: Record<string, string> = {
  full_name: 'u.full_name',
  student_code: 's.student_code',
  created_at: 's.created_at',
};

const FILTER_CONFIG: FilterConfig = {
  searchableColumns: ['u.full_name', 'u.email', 's.student_code', 's.guardian_name'],
  filterableColumns: [],
};

export const studentRepository = {
  // user + student profile together — caller (service) runs this in a transaction
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

  async createStudentProfile(
    client: PoolClient,
    {
      user_id,
      student_code,
      date_of_birth,
      guardian_name,
      guardian_phone,
      address,
    }: CreateStudentProfileData,
  ): Promise<StudentRow> {
    const { rows } = await client.query<StudentRow>(
      `INSERT INTO students (user_id, student_code, date_of_birth, guardian_name, guardian_phone, address)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        user_id,
        student_code,
        date_of_birth || null,
        guardian_name || null,
        guardian_phone || null,
        address || null,
      ],
    );
    return rows[0];
  },

  async findAll(
    queryOptions: ListQuery,
    { limit, offset }: Pick<Pagination, 'limit' | 'offset'>,
  ): Promise<StudentListRow[]> {
    const values: unknown[] = [];
    const countRef = { value: 1 };

    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef, 's');
    const { sortBy, sortOrder } = buildOrder(queryOptions, SORTABLE_FIELDS, 'created_at');

    values.push(limit, offset);
    const limitIdx = countRef.value;
    const offsetIdx = countRef.value + 1;

    const { rows } = await query<StudentListRow>(
      `SELECT ${SAFE_COLUMNS}
       FROM students s
       JOIN users u ON u.id = s.user_id
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
    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef, 's');
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM students s JOIN users u ON u.id = s.user_id ${where}`,
      values,
    );
    return parseInt(rows[0].count);
  },

  async findById(id: string): Promise<StudentListRow | null> {
    const { rows } = await query<StudentListRow>(
      `SELECT ${SAFE_COLUMNS}
       FROM students s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.deleted_at IS NULL`,
      [id],
    );
    return rows[0] || null;
  },

  async findByStudentCode(student_code: string): Promise<StudentRow | null> {
    const { rows } = await query<StudentRow>(
      `SELECT * FROM students WHERE student_code = $1 AND deleted_at IS NULL`,
      [student_code],
    );
    return rows[0] || null;
  },

  async findByUserId(user_id: string): Promise<StudentRow | null> {
    const { rows } = await query<StudentRow>(
      `SELECT * FROM students WHERE user_id = $1 AND deleted_at IS NULL`,
      [user_id],
    );
    return rows[0] || null;
  },

  // Student's current enrollment (for the active session) — to get class/section/roll
  async findCurrentEnrollment(studentId: string): Promise<CurrentEnrollmentRow | null> {
    const { rows } = await query<CurrentEnrollmentRow>(
      `SELECT
         se.id AS enrollment_id, se.roll_number,
         se.class_id, c.name AS class_name,
         se.section_id, sec.name AS section_name,
         se.academic_session_id, asess.name AS session_name
       FROM student_enrollments se
       JOIN academic_sessions asess ON asess.id = se.academic_session_id
       JOIN classes c ON c.id = se.class_id
       LEFT JOIN sections sec ON sec.id = se.section_id
       WHERE se.student_id = $1 AND asess.is_active = true AND se.deleted_at IS NULL
       LIMIT 1`,
      [studentId],
    );
    return rows[0] || null;
  },

  async update(id: string, fields: UpdateStudentData): Promise<StudentRow | null> {
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
    const { rows } = await query<StudentRow>(
      `UPDATE students SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length} AND deleted_at IS NULL
       RETURNING *`,
      params,
    );
    return rows[0] || null;
  },

  async softDelete(id: string): Promise<{ id: string; user_id: string | null } | null> {
    const { rows } = await query<{ id: string; user_id: string | null }>(
      `UPDATE students SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id, user_id`,
      [id],
    );
    return rows[0] || null;
  },

  async hasEnrollments(studentId: string): Promise<boolean> {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM student_enrollments WHERE student_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [studentId],
    );
    return rows.length > 0;
  },
};
