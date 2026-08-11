import type { PoolClient } from 'pg';
import { query } from '../../config/db.js';
import { buildWhereClause, type FilterConfig } from '../../utils/queryBuilder.js';
import { buildOrder } from '../../utils/order.js';
import type { ListQuery, Pagination } from '../../types/common.types.js';
import type { ExamResultRow, ExamStatus, ExamType } from '../../types/db.types.js';

/** findAll/findById — the result joined with its exam, student and subject. */
export interface ExamResultDetailRow extends ExamResultRow {
  exam_name: string;
  exam_type: ExamType;
  exam_status: ExamStatus;
  student_name: string;
  student_code: string;
  subject_name: string;
  subject_code: string | null;
}

/** findByExamId — no exam columns (they are the same for every row). */
export interface ExamResultWithStudentRow extends ExamResultRow {
  student_name: string;
  student_code: string;
  subject_name: string;
  subject_code: string | null;
}

/** findByExamAndStudent — subject columns only. */
export interface ExamResultWithSubjectRow extends ExamResultRow {
  subject_name: string;
  subject_code: string | null;
}

export interface CreateExamResultData {
  exam_id: string;
  student_id: string;
  subject_id: string;
  /** validated as a number by the service; pg stores it as numeric */
  marks: number;
  grade: string | null;
}

export interface UpdateExamResultData {
  marks?: number;
  grade?: string | null;
}

const SORTABLE_FIELDS: Record<string, string> = {
  marks: 'er.marks',
  created_at: 'er.created_at',
};

const FILTER_CONFIG: FilterConfig = {
  searchableColumns: [],
  filterableColumns: [
    { param: 'exam_id', column: 'er.exam_id' },
    { param: 'student_id', column: 'er.student_id' },
    { param: 'subject_id', column: 'er.subject_id' },
  ],
};

const DETAIL_SELECT = `
  SELECT
    er.*,
    e.name AS exam_name, e.exam_type, e.status AS exam_status,
    u.full_name AS student_name, s.student_code,
    sub.name AS subject_name, sub.code AS subject_code
  FROM exam_results er
  JOIN exams e ON e.id = er.exam_id
  JOIN students s ON s.id = er.student_id
  JOIN users u ON u.id = s.user_id
  JOIN subjects sub ON sub.id = er.subject_id
`;

export const examResultRepository = {
  async create({
    exam_id,
    student_id,
    subject_id,
    marks,
    grade,
  }: CreateExamResultData): Promise<ExamResultRow> {
    const { rows } = await query<ExamResultRow>(
      `INSERT INTO exam_results (exam_id, student_id, subject_id, marks, grade)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [exam_id, student_id, subject_id, marks, grade],
    );
    return rows[0];
  },

  async findAll(
    queryOptions: ListQuery,
    { limit, offset }: Pick<Pagination, 'limit' | 'offset'>,
  ): Promise<ExamResultDetailRow[]> {
    const values: unknown[] = [];
    const countRef = { value: 1 };

    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef, 'er');
    const { sortBy, sortOrder } = buildOrder(queryOptions, SORTABLE_FIELDS, 'created_at');

    values.push(limit, offset);
    const limitIdx = countRef.value;
    const offsetIdx = countRef.value + 1;

    const { rows } = await query<ExamResultDetailRow>(
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
    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef, 'er');
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM exam_results er ${where}`,
      values,
    );
    return parseInt(rows[0].count);
  },

  async findById(id: string): Promise<ExamResultDetailRow | null> {
    const { rows } = await query<ExamResultDetailRow>(
      `${DETAIL_SELECT}
       WHERE er.id = $1 AND er.deleted_at IS NULL`,
      [id],
    );
    return rows[0] || null;
  },

  // Whether an entry already exists per the (exam_id, student_id, subject_id) unique constraint
  async findByExamStudentSubject(
    exam_id: string,
    student_id: string,
    subject_id: string,
  ): Promise<ExamResultRow | null> {
    const { rows } = await query<ExamResultRow>(
      `SELECT * FROM exam_results
       WHERE exam_id = $1 AND student_id = $2 AND subject_id = $3 AND deleted_at IS NULL`,
      [exam_id, student_id, subject_id],
    );
    return rows[0] || null;
  },

  // All subject-wise results for an exam (to build a marksheet — the caller does the student-wise grouping)
  async findByExamId(examId: string): Promise<ExamResultWithStudentRow[]> {
    const { rows } = await query<ExamResultWithStudentRow>(
      `SELECT
         er.*,
         u.full_name AS student_name, s.student_code,
         sub.name AS subject_name, sub.code AS subject_code
       FROM exam_results er
       JOIN students s ON s.id = er.student_id
       JOIN users u ON u.id = s.user_id
       JOIN subjects sub ON sub.id = er.subject_id
       WHERE er.exam_id = $1 AND er.deleted_at IS NULL
       ORDER BY u.full_name, sub.name`,
      [examId],
    );
    return rows;
  },

  // All subject results of a single exam for a single student — for a marksheet/report card
  async findByExamAndStudent(
    examId: string,
    studentId: string,
  ): Promise<ExamResultWithSubjectRow[]> {
    const { rows } = await query<ExamResultWithSubjectRow>(
      `SELECT er.*, sub.name AS subject_name, sub.code AS subject_code
       FROM exam_results er
       JOIN subjects sub ON sub.id = er.subject_id
       WHERE er.exam_id = $1 AND er.student_id = $2 AND er.deleted_at IS NULL
       ORDER BY sub.name`,
      [examId, studentId],
    );
    return rows;
  },

  async update(id: string, { marks, grade }: UpdateExamResultData): Promise<ExamResultRow | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (marks !== undefined) {
      params.push(marks);
      setClauses.push(`marks = $${params.length}`);
    }
    if (grade !== undefined) {
      params.push(grade);
      setClauses.push(`grade = $${params.length}`);
    }
    if (!setClauses.length) return null;

    params.push(id);
    const { rows } = await query<ExamResultRow>(
      `UPDATE exam_results SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length} AND deleted_at IS NULL
       RETURNING *`,
      params,
    );
    return rows[0] || null;
  },

  async softDelete(id: string): Promise<{ id: string } | null> {
    const { rows } = await query<{ id: string }>(
      `UPDATE exam_results SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    return rows[0] || null;
  },

  // bulk entry — set marks for many students/subjects at once for a single exam (when a teacher enters them together)
  // instead of a single insert, loop with a transaction client — individual errors can be caught on duplicates
  async bulkCreate(client: PoolClient, entries: CreateExamResultData[]): Promise<ExamResultRow[]> {
    const results: ExamResultRow[] = [];
    for (const entry of entries) {
      const { rows } = await client.query<ExamResultRow>(
        `INSERT INTO exam_results (exam_id, student_id, subject_id, marks, grade)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (exam_id, student_id, subject_id)
         DO UPDATE SET marks = EXCLUDED.marks, grade = EXCLUDED.grade, updated_at = NOW(),
                        deleted_at = NULL
         RETURNING *`,
        [entry.exam_id, entry.student_id, entry.subject_id, entry.marks, entry.grade],
      );
      results.push(rows[0]);
    }
    return results;
  },
};
