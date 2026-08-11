import {
  subjectAssignmentRepository,
  type CreateSubjectAssignmentData,
  type SubjectAssignmentDetailRow,
  type TeacherAssignmentDetailRow,
  type UpdateSubjectAssignmentData,
} from './subject-assignment.repository.js';
import { teacherRepository } from '../teachers/teacher.repository.js';
import { classRepository } from '../classes/class.repository.js';
import { sectionRepository } from '../sections/section.repository.js';
import { subjectRepository } from '../subjects/subject.repository.js';
import { academicSessionRepository } from '../academic-sessions/academic-session.repository.js';
// NOTE: this used to import '../../utils/AppError.js' with a capital A. The file is
// appError.ts — the mismatch only worked because Windows/macOS filesystems are
// case-insensitive, and would have failed to resolve on a Linux deploy.
import { AppError } from '../../utils/appError.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { assertUuid } from '../../utils/validators.js';
import type { ListQuery, Paginated } from '../../types/common.types.js';
import type { SubjectAssignmentRow } from '../../types/db.types.js';

export type CreateSubjectAssignmentInput = CreateSubjectAssignmentData;

export interface UpdateSubjectAssignmentInput extends UpdateSubjectAssignmentData {
  /** validated but not written — update() does not touch assigned_by */
  assigned_by?: string | null;
}

/** create() reports how many other teachers already hold the same slot (informational). */
export interface CreatedSubjectAssignment extends SubjectAssignmentRow {
  other_teachers_on_same_slot: number;
}

export const subjectAssignmentService = {
  async create({
    teacher_id,
    class_id,
    section_id,
    subject_id,
    academic_session_id,
    assigned_by,
  }: CreateSubjectAssignmentInput): Promise<CreatedSubjectAssignment> {
    teacher_id = assertUuid(teacher_id, 'teacher_id');
    class_id = assertUuid(class_id, 'class_id');
    subject_id = assertUuid(subject_id, 'subject_id');
    academic_session_id = assertUuid(academic_session_id, 'academic_session_id');
    section_id = assertUuid(section_id, 'section_id', { required: false });
    assigned_by = assertUuid(assigned_by, 'assigned_by', { required: false });

    const teacher = await teacherRepository.findById(teacher_id);
    if (!teacher) throw new AppError('Teacher not found', 404);

    const cls = await classRepository.findById(class_id);
    if (!cls) throw new AppError('Class not found', 404);

    const subject = await subjectRepository.findById(subject_id);
    if (!subject) throw new AppError('Subject not found', 404);

    const session = await academicSessionRepository.findById(academic_session_id);
    if (!session) throw new AppError('Academic session not found', 404);

    // ── whether the class has sections — the same rule as student_enrollment applies here too ──
    const classSections = await sectionRepository.findByClassId(class_id);
    const classHasSections = classSections.length > 0;

    if (classHasSections) {
      if (!section_id) {
        throw new AppError('This class has sections — section_id is required', 400);
      }
      const validSection = classSections.find((s) => s.id === section_id);
      if (!validSection) {
        throw new AppError('section_id does not belong to the given class', 400);
      }
    } else if (section_id) {
      throw new AppError('This class has no sections — section_id should not be provided', 400);
    }

    const finalSectionId = classHasSections ? section_id : null;

    // ── duplicate check — return a clear error before the DB unique constraint kicks in ──
    const existing = await subjectAssignmentRepository.findExact({
      teacher_id,
      class_id,
      section_id: finalSectionId,
      subject_id,
      academic_session_id,
    });
    if (existing) {
      throw new AppError(
        'This teacher is already assigned to this exact class/section/subject/session',
        409,
      );
    }

    // ── warn if another teacher is already assigned to the same slot (do not block, just inform) ──
    // in a school the same subject is sometimes shared by two teachers, so we surface info instead of hard-blocking
    const otherTeachers = await subjectAssignmentRepository.findOtherTeacherForSlot({
      class_id,
      section_id: finalSectionId,
      subject_id,
      academic_session_id,
    });

    const created = await subjectAssignmentRepository.create({
      teacher_id,
      class_id,
      section_id: finalSectionId,
      subject_id,
      academic_session_id,
      assigned_by,
    });

    return { ...created, other_teachers_on_same_slot: otherTeachers.length };
  },

  async getAll(queryOptions: ListQuery): Promise<Paginated<SubjectAssignmentDetailRow>> {
    const { page, limit, offset } = getPagination(queryOptions);
    const [data, total] = await Promise.all([
      subjectAssignmentRepository.findAll(queryOptions, { limit, offset }),
      subjectAssignmentRepository.countAll(queryOptions),
    ]);
    return { data, meta: buildMeta({ total, page, limit }) };
  },

  async getById(id: string): Promise<SubjectAssignmentDetailRow> {
    const assignment = await subjectAssignmentRepository.findById(id);
    if (!assignment) throw new AppError('Subject assignment not found', 404);
    return assignment;
  },

  async getByTeacher(teacherId: string): Promise<TeacherAssignmentDetailRow[]> {
    const teacher = await teacherRepository.findById(teacherId);
    if (!teacher) throw new AppError('Teacher not found', 404);
    return subjectAssignmentRepository.findByTeacherId(teacherId);
  },

  // changing an assignment mainly means reassigning the teacher — for other fields it is better to create a new assignment,
  // but partial update is supported for flexibility
  async update(id: string, fields: UpdateSubjectAssignmentInput): Promise<SubjectAssignmentRow> {
    const assignment = await this.getById(id);

    // validate only the provided fields — writing undefined would wipe the assignment's value
    // in the merged spread below, so we only reassign when the field is present
    if (fields.teacher_id !== undefined) {
      fields.teacher_id = assertUuid(fields.teacher_id, 'teacher_id');
    }
    if (fields.class_id !== undefined) {
      fields.class_id = assertUuid(fields.class_id, 'class_id');
    }
    if (fields.section_id !== undefined && fields.section_id !== null) {
      fields.section_id = assertUuid(fields.section_id, 'section_id');
    }
    if (fields.subject_id !== undefined) {
      fields.subject_id = assertUuid(fields.subject_id, 'subject_id');
    }
    if (fields.academic_session_id !== undefined) {
      fields.academic_session_id = assertUuid(fields.academic_session_id, 'academic_session_id');
    }
    if (fields.assigned_by !== undefined && fields.assigned_by !== null) {
      fields.assigned_by = assertUuid(fields.assigned_by, 'assigned_by');
    }

    if (fields.teacher_id) {
      const teacher = await teacherRepository.findById(fields.teacher_id);
      if (!teacher) throw new AppError('Teacher not found', 404);
    }

    // duplicate check — whether the final combination (including changed fields) matches another assignment
    const merged = { ...assignment, ...fields };
    const existing = await subjectAssignmentRepository.findExact({
      teacher_id: merged.teacher_id!,
      class_id: merged.class_id!,
      section_id: merged.section_id,
      subject_id: merged.subject_id!,
      academic_session_id: merged.academic_session_id!,
    });
    if (existing && existing.id !== id) {
      throw new AppError('Another assignment already exists with this exact combination', 409);
    }

    const updated = await subjectAssignmentRepository.update(id, fields);
    if (!updated) throw new AppError('Subject assignment not found', 404);
    return updated;
  },

  async delete(id: string): Promise<{ id: string }> {
    await this.getById(id);
    const deleted = await subjectAssignmentRepository.softDelete(id);
    if (!deleted) throw new AppError('Subject assignment not found', 404);
    return deleted;
  },
};
