import {
  examResultRepository,
  type ExamResultDetailRow,
  type ExamResultWithStudentRow,
  type ExamResultWithSubjectRow,
} from './exam-result.repository.js';
import { examRepository, type ExamWithNamesRow } from '../exams/exam.repository.js';
import { studentRepository, type StudentListRow } from '../students/student.repository.js';
import { subjectRepository } from '../subjects/subject.repository.js';
import { calculateGrade } from '../../utils/grade.js';
// NOTE: this used to import '../../utils/AppError.js' with a capital A — the file is
// appError.ts. It only resolved because Windows/macOS filesystems are case-insensitive.
import { AppError } from '../../utils/appError.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { withTransaction } from '../../config/db.js';
import { assertUuid, assertNumber, assertArray } from '../../utils/validators.js';
import type { ListQuery, Paginated } from '../../types/common.types.js';
import type { ExamResultRow, ExamType } from '../../types/db.types.js';

export interface CreateExamResultInput {
  exam_id: string;
  student_id: string;
  subject_id: string;
  marks: number;
}

/** One raw bulk entry — every field is validated before use, so they start out unknown. */
interface RawBulkEntry {
  student_id?: unknown;
  subject_id?: unknown;
  marks?: unknown;
}

export interface MarksheetResult {
  exam: ExamWithNamesRow;
  student: StudentListRow;
  results: ExamResultWithSubjectRow[];
  total_marks: number;
}

export interface CompletionReport {
  examId: string;
  examType: ExamType;
  isComplete: boolean;
}

export const examResultService = {
  async create({
    exam_id,
    student_id,
    subject_id,
    marks,
  }: CreateExamResultInput): Promise<ExamResultRow> {
    exam_id = assertUuid(exam_id, 'exam_id');
    student_id = assertUuid(student_id, 'student_id');
    subject_id = assertUuid(subject_id, 'subject_id');
    marks = assertNumber(marks, 'marks', { min: 0, max: 100 });

    const exam = await examRepository.findById(exam_id);
    if (!exam) throw new AppError('Exam not found', 404);

    // ── Once published, direct create/update is blocked — correction happens in a separate workflow (later) ──
    if (exam.status === 'PUBLISHED') {
      throw new AppError('This exam is published — unpublish it first to modify results', 400);
    }

    const student = await studentRepository.findById(student_id);
    if (!student) throw new AppError('Student not found', 404);

    const subject = await subjectRepository.findById(subject_id);
    if (!subject) throw new AppError('Subject not found', 404);

    const existing = await examResultRepository.findByExamStudentSubject(
      exam_id,
      student_id,
      subject_id,
    );
    if (existing) {
      throw new AppError(
        'Result already exists for this exam/student/subject — use update instead',
        409,
      );
    }

    const grade = calculateGrade(marks);
    return examResultRepository.create({ exam_id, student_id, subject_id, marks, grade });
  },

  // Enter marks for many students at once — teachers usually work this way (one exam, one subject, the whole class)
  // entries = [{ student_id, subject_id, marks }, ...]
  async bulkCreate(examId: string, entries: unknown[]): Promise<ExamResultRow[]> {
    examId = assertUuid(examId, 'examId');
    const rawEntries = assertArray<RawBulkEntry>(entries, 'entries');

    const exam = await examRepository.findById(examId);
    if (!exam) throw new AppError('Exam not found', 404);

    if (exam.status === 'PUBLISHED') {
      throw new AppError('This exam is published — unpublish it first to modify results', 400);
    }

    // validated into a new, fully typed list rather than mutating the raw entries in place
    const enrichedEntries = rawEntries.map((e) => {
      const student_id = assertUuid(e.student_id, 'student_id');
      const subject_id = assertUuid(e.subject_id, 'subject_id');
      const marks = assertNumber(e.marks, 'marks', { min: 0, max: 100 });
      return {
        exam_id: examId,
        student_id,
        subject_id,
        marks,
        grade: calculateGrade(marks),
      };
    });

    return withTransaction((client) => examResultRepository.bulkCreate(client, enrichedEntries));
  },

  async getAll(queryOptions: ListQuery): Promise<Paginated<ExamResultDetailRow>> {
    const { page, limit, offset } = getPagination(queryOptions);
    const [data, total] = await Promise.all([
      examResultRepository.findAll(queryOptions, { limit, offset }),
      examResultRepository.countAll(queryOptions),
    ]);
    return { data, meta: buildMeta({ total, page, limit }) };
  },

  async getById(id: string): Promise<ExamResultDetailRow> {
    const result = await examResultRepository.findById(id);
    if (!result) throw new AppError('Exam result not found', 404);
    return result;
  },

  async getByExam(examId: string): Promise<ExamResultWithStudentRow[]> {
    const exam = await examRepository.findById(examId);
    if (!exam) throw new AppError('Exam not found', 404);
    return examResultRepository.findByExamId(examId);
  },

  // Marksheet — marks + grade for all subjects of a single exam for a single student
  async getMarksheet(examId: string, studentId: string): Promise<MarksheetResult> {
    const exam = await examRepository.findById(examId);
    if (!exam) throw new AppError('Exam not found', 404);

    const student = await studentRepository.findById(studentId);
    if (!student) throw new AppError('Student not found', 404);

    const results = await examResultRepository.findByExamAndStudent(examId, studentId);
    // marks is numeric, which pg returns as a string — parseFloat is required, not cosmetic
    const total = results.reduce((sum, r) => sum + parseFloat(String(r.marks)), 0);

    return { exam, student, results, total_marks: total };
  },

  async update(id: string, { marks }: { marks: number }): Promise<ExamResultRow> {
    const result = await this.getById(id);

    const exam = await examRepository.findById(result.exam_id!);
    if (exam?.status === 'PUBLISHED') {
      throw new AppError('This exam is published — unpublish it first to modify results', 400);
    }

    marks = assertNumber(marks, 'marks', { min: 0, max: 100 });

    const grade = calculateGrade(marks);
    const updated = await examResultRepository.update(id, { marks, grade });
    if (!updated) throw new AppError('Exam result not found', 404);
    return updated;
  },

  async delete(id: string): Promise<{ id: string }> {
    const result = await this.getById(id);

    const exam = await examRepository.findById(result.exam_id!);
    if (exam?.status === 'PUBLISHED') {
      throw new AppError('This exam is published — unpublish it first to delete results', 400);
    }

    const deleted = await examResultRepository.softDelete(id);
    if (!deleted) throw new AppError('Exam result not found', 404);
    return deleted;
  },

  // ── The core entry point for the auto-trigger hook ──
  // The controller calls this after result entry/bulk-entry — it only reports "whether everything has been entered",
  // the actual decision to trigger the queue is made by the controller/ranking module (this service only provides info,
  // it does not import any queue/job itself — the hook will be placed here once the core/ranking/auto-trigger files are restored)
  async checkAndReportCompletion(examId: string): Promise<CompletionReport> {
    const exam = await examRepository.findById(examId);
    if (!exam) throw new AppError('Exam not found', 404);

    const isComplete = await examRepository
      .countStudentsWithResults(examId)
      .then(async (resultCount) => {
        if (!exam.class_id || !exam.academic_session_id) return false;
        const enrolledCount = await examRepository.countEnrolledStudents(
          exam.class_id,
          exam.academic_session_id,
        );
        return enrolledCount > 0 && resultCount >= enrolledCount;
      });

    return { examId, examType: exam.exam_type, isComplete };
  },
};
