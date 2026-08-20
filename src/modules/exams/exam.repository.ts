import { query } from '../../config/db.js';
import { buildWhereClause, type FilterConfig } from '../../utils/queryBuilder.js';
import { buildOrder } from '../../utils/order.js';
import type { ListQuery, Pagination } from '../../types/common.types.js';
import type { ExamRow, ExamStatus, ExamType } from '../../types/db.types.js';

/** findAll/findById join the class and session names (both LEFT JOINs, so both nullable). */
export interface ExamWithNamesRow extends ExamRow {
  class_name: string | null;
  session_name: string | null;
}

export interface CreateExamData {
  name: string;
  class_id?: string | null;
  academic_session_id?: string | null;
  exam_date?: string | null;
  exam_type?: ExamType;
}

export interface UpdateExamData {
  name?: string;
  class_id?: string | null;
  academic_session_id?: string | null;
  exam_date?: string | null;
  exam_type?: ExamType;
}

/** Only these columns may be written by update() — status has its own setStatus().
 *  Exported so the service can reject an empty PATCH before it reaches the SET clause. */
export const ALLOWED_UPDATE_FIELDS = [
  'name',
  'class_id',
  'academic_session_id',
  'exam_date',
  'exam_type',
] as const;

const SORTABLE_FIELDS: Record<string, string> = {
  name: 'e.name',
  exam_date: 'e.exam_date',
  created_at: 'e.created_at',
};

const FILTER_CONFIG: FilterConfig = {
  searchableColumns: ['e.name'],
  filterableColumns: [
    { param: 'class_id', column: 'e.class_id' },
    { param: 'academic_session_id', column: 'e.academic_session_id' },
    { param: 'exam_type', column: 'e.exam_type' },
  ],
};

export const examRepository = {
  async create({
    name,
    class_id,
    academic_session_id,
    exam_date,
    exam_type,
  }: CreateExamData): Promise<ExamRow> {
    const { rows } = await query<ExamRow>(
      `INSERT INTO exams (name, class_id, academic_session_id, exam_date, exam_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        name,
        class_id || null,
        academic_session_id || null,
        exam_date || null,
        exam_type || 'ADMISSION',
      ],
    );
    return rows[0];
  },

  async findAll(
    queryOptions: ListQuery,
    { limit, offset }: Pick<Pagination, 'limit' | 'offset'>,
  ): Promise<ExamWithNamesRow[]> {
    const values: unknown[] = [];
    const countRef = { value: 1 };

    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef, 'e');
    const { sortBy, sortOrder } = buildOrder(queryOptions, SORTABLE_FIELDS, 'exam_date');

    values.push(limit, offset);
    const limitIdx = countRef.value;
    const offsetIdx = countRef.value + 1;

    const { rows } = await query<ExamWithNamesRow>(
      `SELECT e.*, c.name AS class_name, asess.name AS session_name
       FROM exams e
       LEFT JOIN classes c ON c.id = e.class_id
       LEFT JOIN academic_sessions asess ON asess.id = e.academic_session_id
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
    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef, 'e');
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM exams e ${where}`,
      values,
    );
    return parseInt(rows[0].count);
  },

  async findById(id: string): Promise<ExamWithNamesRow | null> {
    const { rows } = await query<ExamWithNamesRow>(
      `SELECT e.*, c.name AS class_name, asess.name AS session_name
       FROM exams e
       LEFT JOIN classes c ON c.id = e.class_id
       LEFT JOIN academic_sessions asess ON asess.id = e.academic_session_id
       WHERE e.id = $1 AND e.deleted_at IS NULL`,
      [id],
    );
    return rows[0] || null;
  },

  async update(id: string, fields: UpdateExamData): Promise<ExamRow | null> {
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
    const { rows } = await query<ExamRow>(
      `UPDATE exams SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length} AND deleted_at IS NULL
       RETURNING *`,
      params,
    );
    return rows[0] || null;
  },

  // For toggling exam status DRAFT ↔ PUBLISHED — kept separate from update()
  // because publishing has special business rules (ranking_locked check), which live in the service
  async setStatus(id: string, status: ExamStatus): Promise<ExamRow | null> {
    const { rows } = await query<ExamRow>(
      `UPDATE exams SET status = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [status, id],
    );
    return rows[0] || null;
  },

  async softDelete(id: string): Promise<{ id: string } | null> {
    const { rows } = await query<{ id: string }>(
      `UPDATE exams SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    return rows[0] || null;
  },

  // Finds the exam of a specific exam_type for a class+session — including status (to check whether it is PUBLISHED)
  // Assumes the same exam_type exists only once per class+session
  async findByClassSessionAndType(
    classId: string,
    academicSessionId: string,
    examType: ExamType,
  ): Promise<ExamRow | null> {
    const { rows } = await query<ExamRow>(
      `SELECT * FROM exams
       WHERE class_id = $1 AND academic_session_id = $2 AND exam_type = $3
         AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [classId, academicSessionId, examType],
    );
    return rows[0] || null;
  },

  async hasResults(id: string): Promise<boolean> {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM exam_results WHERE exam_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    return rows.length > 0;
  },

  // How many students in total are enrolled in this exam's class — needed for auto-trigger
  // (this count is required to determine "whether result entry is done for everyone")
  async countEnrolledStudents(classId: string, academicSessionId: string): Promise<number> {
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM student_enrollments
       WHERE class_id = $1 AND academic_session_id = $2 AND deleted_at IS NULL`,
      [classId, academicSessionId],
    );
    return parseInt(rows[0].count);
  },

  // How many distinct students have a result entry in this exam
  async countStudentsWithResults(examId: string): Promise<number> {
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT student_id) FROM exam_results
       WHERE exam_id = $1 AND deleted_at IS NULL`,
      [examId],
    );
    return parseInt(rows[0].count);
  },
};
