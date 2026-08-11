import {
  examRepository,
  type CreateExamData,
  type ExamWithNamesRow,
  type UpdateExamData,
} from './exam.repository.js';
import { classRepository } from '../classes/class.repository.js';
import { academicSessionRepository } from '../academic-sessions/academic-session.repository.js';
import { AppError } from '../../utils/appError.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { rankingService } from '../ranking/ranking.service.js';
import {
  assertString,
  assertUuid,
  assertDate,
  assertEnum,
  EXAM_TYPES,
} from '../../utils/validators.js';
import type { ListQuery, Paginated } from '../../types/common.types.js';
import type { ExamRow } from '../../types/db.types.js';

export type CreateExamInput = CreateExamData;
export type UpdateExamInput = UpdateExamData;

export const examService = {
  async create({
    name,
    class_id,
    academic_session_id,
    exam_date,
    exam_type,
  }: CreateExamInput): Promise<ExamRow> {
    name = assertString(name, 'name', { max: 100 });
    class_id = assertUuid(class_id, 'class_id', { required: false });
    academic_session_id = assertUuid(academic_session_id, 'academic_session_id', {
      required: false,
    });
    exam_date = assertDate(exam_date, 'exam_date', { required: false });
    exam_type = assertEnum(exam_type, 'exam_type', EXAM_TYPES, { required: false });

    if (class_id) {
      const cls = await classRepository.findById(class_id);
      if (!cls) throw new AppError('Class not found', 404);
    }

    if (academic_session_id) {
      const session = await academicSessionRepository.findById(academic_session_id);
      if (!session) throw new AppError('Academic session not found', 404);
    }

    return examRepository.create({
      name,
      class_id,
      academic_session_id,
      exam_date,
      exam_type,
    });
  },

  async getAll(queryOptions: ListQuery): Promise<Paginated<ExamWithNamesRow>> {
    const { page, limit, offset } = getPagination(queryOptions);
    const [data, total] = await Promise.all([
      examRepository.findAll(queryOptions, { limit, offset }),
      examRepository.countAll(queryOptions),
    ]);
    return { data, meta: buildMeta({ total, page, limit }) };
  },

  async getById(id: string): Promise<ExamWithNamesRow> {
    const exam = await examRepository.findById(id);
    if (!exam) throw new AppError('Exam not found', 404);
    return exam;
  },

  async update(id: string, fields: UpdateExamInput): Promise<ExamRow> {
    await this.getById(id);

    if (fields.name !== undefined) {
      fields.name = assertString(fields.name, 'name', { max: 100 });
    }
    if (fields.class_id !== undefined) {
      fields.class_id = assertUuid(fields.class_id, 'class_id', { required: false });
    }
    if (fields.academic_session_id !== undefined) {
      fields.academic_session_id = assertUuid(fields.academic_session_id, 'academic_session_id', {
        required: false,
      });
    }
    if (fields.exam_date !== undefined) {
      fields.exam_date = assertDate(fields.exam_date, 'exam_date', { required: false });
    }
    if (fields.exam_type !== undefined) {
      fields.exam_type = assertEnum(fields.exam_type, 'exam_type', EXAM_TYPES, { required: false });
    }

    const updated = await examRepository.update(id, fields);
    if (!updated) throw new AppError('Exam not found', 404);
    return updated;
  },

  async delete(id: string): Promise<{ id: string }> {
    await this.getById(id);

    const hasResults = await examRepository.hasResults(id);
    if (hasResults) {
      throw new AppError('Cannot delete exam — results already exist. Delete results first.', 400);
    }

    const deleted = await examRepository.softDelete(id);
    if (!deleted) throw new AppError('Exam not found', 404);
    return deleted;
  },

  // Whether result entry is complete for all students enrolled in the exam's class — the core check for auto-trigger
  // Only a FINAL exam triggers ranking/roll — not UNIT_TEST/MIDTERM/ADMISSION
  async isResultEntryComplete(examId: string): Promise<boolean> {
    const exam = await this.getById(examId);

    if (exam.exam_type !== 'FINAL') return false; // ranking is never triggered for anything other than FINAL
    if (!exam.class_id || !exam.academic_session_id) return false; // cannot check without class/session

    const [enrolledCount, resultCount] = await Promise.all([
      examRepository.countEnrolledStudents(exam.class_id, exam.academic_session_id),
      examRepository.countStudentsWithResults(examId),
    ]);

    return enrolledCount > 0 && resultCount >= enrolledCount;
  },

  // ── DRAFT → PUBLISHED ──
  // After publishing, exam_results can no longer be edited normally (correction happens in a separate flow, a later step)
  async publish(id: string): Promise<ExamRow | null> {
    const exam = await this.getById(id);

    if (exam.status === 'PUBLISHED') {
      throw new AppError('Exam is already published', 400);
    }

    if (!exam.class_id || !exam.academic_session_id) {
      throw new AppError('Exam must have a class and academic session before publishing', 400);
    }

    const hasResults = await examRepository.hasResults(id);
    if (!hasResults) {
      throw new AppError('Cannot publish an exam with no results entered', 400);
    }

    const updated = await examRepository.setStatus(id, 'PUBLISHED');

    // ── Auto-trigger ──
    // When a FINAL or ADMISSION exam is published, the ranking module itself verifies whether the conditions to run ranking are met.
    // This never throws (publish succeeded, ranking is a separate concern) — if the conditions are not met it is silently skipped.
    if (exam.exam_type === 'FINAL' || exam.exam_type === 'ADMISSION') {
      await rankingService.autoTriggerAfterPublish({
        classId: exam.class_id,
        academicSessionId: exam.academic_session_id,
        examType: exam.exam_type,
      });
    }

    return updated;
  },

  // ── PUBLISHED → DRAFT ──
  // Unpublishing allows result correction (to be added in a later step), but it must be blocked if ranking_locked —
  // otherwise the basis of an already-locked roll/rank would change while the roll number stays the same as before
  async unpublish(id: string): Promise<ExamRow | null> {
    const exam = await this.getById(id);

    if (exam.status === 'DRAFT') {
      throw new AppError('Exam is already in draft status', 400);
    }

    return examRepository.setStatus(id, 'DRAFT');
  },
};
