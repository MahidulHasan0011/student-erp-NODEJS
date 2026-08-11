import { query } from '../../config/db.js';
import { buildWhereClause, type FilterConfig } from '../../utils/queryBuilder.js';
import { buildOrder } from '../../utils/order.js';
import type { ListQuery, Pagination } from '../../types/common.types.js';
import type { StudentEnrollmentRow } from '../../types/db.types.js';

/** findAll/findById — the enrollment plus every name it references. */
export interface EnrollmentDetailRow extends StudentEnrollmentRow {
  student_name: string;
  student_code: string;
  class_name: string;
  /** LEFT JOIN — a class need not have sections */
  section_name: string | null;
  session_name: string;
}

export interface CreateEnrollmentData {
  student_id: string;
  class_id: string;
  section_id?: string | null;
  academic_session_id: string;
}

export interface UpdateEnrollmentData {
  class_id?: string;
  section_id?: string | null;
}

/** roll_number is intentionally absent — only the ranking/roll engine writes it. */
const ALLOWED_UPDATE_FIELDS = ['class_id', 'section_id'] as const;

const SORTABLE_FIELDS: Record<string, string> = {
  roll_number: 'se.roll_number',
  created_at: 'se.created_at',
};

const FILTER_CONFIG: FilterConfig = {
  searchableColumns: [],
  filterableColumns: [
    { param: 'class_id', column: 'se.class_id' },
    { param: 'section_id', column: 'se.section_id' },
    { param: 'academic_session_id', column: 'se.academic_session_id' },
  ],
};

const DETAIL_SELECT = `
  SELECT
    se.*,
    u.full_name AS student_name, s.student_code,
    c.name AS class_name, sec.name AS section_name, asess.name AS session_name
  FROM student_enrollments se
  JOIN students s ON s.id = se.student_id
  JOIN users u ON u.id = s.user_id
  JOIN classes c ON c.id = se.class_id
  LEFT JOIN sections sec ON sec.id = se.section_id
  JOIN academic_sessions asess ON asess.id = se.academic_session_id
`;

export const studentEnrollmentRepository = {
  async create({
    student_id,
    class_id,
    section_id,
    academic_session_id,
  }: CreateEnrollmentData): Promise<StudentEnrollmentRow> {
    const { rows } = await query<StudentEnrollmentRow>(
      `INSERT INTO student_enrollments (student_id, class_id, section_id, academic_session_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [student_id, class_id, section_id || null, academic_session_id],
    );
    return rows[0];
  },

  async findAll(
    queryOptions: ListQuery,
    { limit, offset }: Pick<Pagination, 'limit' | 'offset'>,
  ): Promise<EnrollmentDetailRow[]> {
    const values: unknown[] = [];
    const countRef = { value: 1 };

    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef, 'se');
    const { sortBy, sortOrder } = buildOrder(queryOptions, SORTABLE_FIELDS, 'created_at');

    values.push(limit, offset);
    const limitIdx = countRef.value;
    const offsetIdx = countRef.value + 1;

    const { rows } = await query<EnrollmentDetailRow>(
      `${DETAIL_SELECT}
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
    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef, 'se');
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM student_enrollments se ${where}`,
      values,
    );
    return parseInt(rows[0].count);
  },

  async findById(id: string): Promise<EnrollmentDetailRow | null> {
    const { rows } = await query<EnrollmentDetailRow>(
      `${DETAIL_SELECT}
       WHERE se.id = $1 AND se.deleted_at IS NULL`,
      [id],
    );
    return rows[0] || null;
  },

  // Check whether the same student + session is already enrolled — per the unique constraint
  async findByStudentAndSession(
    studentId: string,
    academicSessionId: string,
  ): Promise<StudentEnrollmentRow | null> {
    const { rows } = await query<StudentEnrollmentRow>(
      `SELECT * FROM student_enrollments
       WHERE student_id = $1 AND academic_session_id = $2 AND deleted_at IS NULL`,
      [studentId, academicSessionId],
    );
    return rows[0] || null;
  },

  async update(id: string, fields: UpdateEnrollmentData): Promise<StudentEnrollmentRow | null> {
    // roll_number is intentionally excluded — only the ranking/roll engine (raw SQL) sets it, not CRUD update
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
    const { rows } = await query<StudentEnrollmentRow>(
      `UPDATE student_enrollments SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length} AND deleted_at IS NULL
       RETURNING *`,
      params,
    );
    return rows[0] || null;
  },

  async softDelete(id: string): Promise<{ id: string } | null> {
    const { rows } = await query<{ id: string }>(
      `UPDATE student_enrollments SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    return rows[0] || null;
  },
};
