import { query } from '../../config/db.js';
import { buildWhereClause, type FilterConfig } from '../../utils/queryBuilder.js';
import { buildOrder } from '../../utils/order.js';
import type { ListQuery, Pagination } from '../../types/common.types.js';
import type { SubjectAssignmentRow } from '../../types/db.types.js';

/** findAll/findById — the assignment plus every name it references. */
export interface SubjectAssignmentDetailRow extends SubjectAssignmentRow {
  teacher_name: string;
  class_name: string;
  /** LEFT JOIN — an assignment need not be section-specific */
  section_name: string | null;
  subject_name: string;
  subject_code: string | null;
  session_name: string;
}

/** findByTeacherId selects a slightly narrower set (no teacher_name / subject_code). */
export interface TeacherAssignmentDetailRow extends SubjectAssignmentRow {
  class_name: string;
  section_name: string | null;
  subject_name: string;
  session_name: string;
}

export interface CreateSubjectAssignmentData {
  teacher_id: string;
  class_id: string;
  section_id?: string | null;
  subject_id: string;
  academic_session_id: string;
  assigned_by?: string | null;
}

/** The five columns the DB unique constraint covers. */
export interface AssignmentSlot {
  teacher_id: string;
  class_id: string;
  section_id?: string | null;
  subject_id: string;
  academic_session_id: string;
}

export interface UpdateSubjectAssignmentData {
  teacher_id?: string;
  class_id?: string;
  section_id?: string | null;
  subject_id?: string;
  academic_session_id?: string;
  /** who last modified this assignment — written on every update so there is a log of changes */
  assigned_by?: string | null;
}

const SORTABLE_FIELDS: Record<string, string> = {
  created_at: 'sa.created_at',
};

const FILTER_CONFIG: FilterConfig = {
  searchableColumns: [],
  filterableColumns: [
    { param: 'teacher_id', column: 'sa.teacher_id' },
    { param: 'class_id', column: 'sa.class_id' },
    { param: 'section_id', column: 'sa.section_id' },
    { param: 'subject_id', column: 'sa.subject_id' },
    { param: 'academic_session_id', column: 'sa.academic_session_id' },
  ],
};

const DETAIL_SELECT = `
  SELECT
    sa.*,
    u.full_name AS teacher_name,
    c.name AS class_name,
    sec.name AS section_name,
    sub.name AS subject_name, sub.code AS subject_code,
    asess.name AS session_name
  FROM subject_assignments sa
  JOIN teachers t ON t.id = sa.teacher_id
  JOIN users u ON u.id = t.user_id
  JOIN classes c ON c.id = sa.class_id
  LEFT JOIN sections sec ON sec.id = sa.section_id
  JOIN subjects sub ON sub.id = sa.subject_id
  JOIN academic_sessions asess ON asess.id = sa.academic_session_id
`;
/** the only columns update() will SET — exported so the service can guard an empty PATCH */
export const ALLOWED_UPDATE_FIELDS = [
  'teacher_id',
  'class_id',
  'section_id',
  'subject_id',
  'academic_session_id',
  'assigned_by',
] as const;

export const subjectAssignmentRepository = {
  async create({
    teacher_id,
    class_id,
    section_id,
    subject_id,
    academic_session_id,
    assigned_by,
  }: CreateSubjectAssignmentData): Promise<SubjectAssignmentRow> {
    const { rows } = await query<SubjectAssignmentRow>(
      `INSERT INTO subject_assignments
         (teacher_id, class_id, section_id, subject_id, academic_session_id, assigned_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        teacher_id,
        class_id,
        section_id || null,
        subject_id,
        academic_session_id,
        assigned_by || null,
      ],
    );
    return rows[0];
  },

  async findAll(
    queryOptions: ListQuery,
    { limit, offset }: Pick<Pagination, 'limit' | 'offset'>,
  ): Promise<SubjectAssignmentDetailRow[]> {
    const values: unknown[] = [];
    const countRef = { value: 1 };

    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef, 'sa');
    const { sortBy, sortOrder } = buildOrder(queryOptions, SORTABLE_FIELDS, 'created_at');

    values.push(limit, offset);
    const limitIdx = countRef.value;
    const offsetIdx = countRef.value + 1;

    const { rows } = await query<SubjectAssignmentDetailRow>(
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
    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef, 'sa');
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM subject_assignments sa ${where}`,
      values,
    );
    return parseInt(rows[0].count);
  },

  async findById(id: string): Promise<SubjectAssignmentDetailRow | null> {
    const { rows } = await query<SubjectAssignmentDetailRow>(
      `${DETAIL_SELECT}
       WHERE sa.id = $1 AND sa.deleted_at IS NULL`,
      [id],
    );
    return rows[0] || null;
  },

  // duplicate check across the 5 fields — matches the DB unique constraint
  // (subject_assignments_teacher_id_class_id_section_id_subject__key)
  async findExact({
    teacher_id,
    class_id,
    section_id,
    subject_id,
    academic_session_id,
  }: AssignmentSlot): Promise<SubjectAssignmentRow | null> {
    const { rows } = await query<SubjectAssignmentRow>(
      `SELECT * FROM subject_assignments
       WHERE teacher_id = $1 AND class_id = $2
         AND section_id IS NOT DISTINCT FROM $3
         AND subject_id = $4 AND academic_session_id = $5
         AND deleted_at IS NULL`,
      [teacher_id, class_id, section_id || null, subject_id, academic_session_id],
    );
    return rows[0] || null;
  },

  // whether another teacher is already assigned to the same class+section+subject+session —
  // (whether two teachers may teach the same subject in the same section is a business-rule question;
  // this method only returns info, the decision to block lives in the service)
  async findOtherTeacherForSlot(
    { class_id, section_id, subject_id, academic_session_id }: Omit<AssignmentSlot, 'teacher_id'>,
    excludeTeacherId: string | null = null,
  ): Promise<SubjectAssignmentRow[]> {
    const params: unknown[] = [class_id, section_id || null, subject_id, academic_session_id];
    let extra = '';
    if (excludeTeacherId) {
      params.push(excludeTeacherId);
      extra = `AND teacher_id != $${params.length}`;
    }

    const { rows } = await query<SubjectAssignmentRow>(
      `SELECT * FROM subject_assignments
       WHERE class_id = $1
         AND section_id IS NOT DISTINCT FROM $2
         AND subject_id = $3 AND academic_session_id = $4
         AND deleted_at IS NULL
         ${extra}`,
      params,
    );
    return rows;
  },

  async update(
    id: string,
    inputData: UpdateSubjectAssignmentData,
  ): Promise<SubjectAssignmentRow | null> {
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
    const { rows } = await query<SubjectAssignmentRow>(
      `UPDATE subject_assignments SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length} AND deleted_at IS NULL
       RETURNING *`,
      params,
    );
    return rows[0] || null;
  },

  async softDelete(id: string): Promise<{ id: string } | null> {
    const { rows } = await query<{ id: string }>(
      `UPDATE subject_assignments SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    return rows[0] || null;
  },

  // all of a teacher's assignments (for the active session) — a similar query was previously
  // used in getWithAssignments in teacher.controller.js; this is the module's own version
  async findByTeacherId(teacherId: string): Promise<TeacherAssignmentDetailRow[]> {
    const { rows } = await query<TeacherAssignmentDetailRow>(
      `SELECT
         sa.*,
         c.name AS class_name, sec.name AS section_name,
         sub.name AS subject_name, asess.name AS session_name
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
};
