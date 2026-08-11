import {
  studentEnrollmentRepository,
  type EnrollmentDetailRow,
} from './student-enrollment.repository.js';
import { studentRepository } from '../students/student.repository.js';
import { classRepository } from '../classes/class.repository.js';
import { sectionRepository } from '../sections/section.repository.js';
import { academicSessionRepository } from '../academic-sessions/academic-session.repository.js';
import { AppError } from '../../utils/appError.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { assertUuid, assertEnum, ENROLLMENT_TYPES } from '../../utils/validators.js';
import type { ListQuery, Paginated } from '../../types/common.types.js';
import type { EnrollmentType, StudentEnrollmentRow } from '../../types/db.types.js';

export interface CreateEnrollmentInput {
  student_id: string;
  class_id: string;
  section_id?: string | null;
  academic_session_id: string;
  /** validated but not persisted on create — the column defaults to 'OLD' */
  enrollment_type?: EnrollmentType;
}

export interface UpdateEnrollmentInput {
  class_id?: string;
  section_id?: string | null;
}

export const studentEnrollmentService = {
  // student_id, class_id, academic_session_id are required — section_id is optional
  // (if the class has sections, section_id must be provided; otherwise it is not needed)
  async create({
    student_id,
    class_id,
    section_id,
    academic_session_id,
    enrollment_type,
  }: CreateEnrollmentInput): Promise<StudentEnrollmentRow> {
    student_id = assertUuid(student_id, 'student_id');
    class_id = assertUuid(class_id, 'class_id');
    academic_session_id = assertUuid(academic_session_id, 'academic_session_id');
    section_id = assertUuid(section_id, 'section_id', { required: false });
    // enrollment_type is not persisted on create (the repo ignores it) — but validate it if provided
    assertEnum(enrollment_type, 'enrollment_type', ENROLLMENT_TYPES, { required: false });

    const student = await studentRepository.findById(student_id);
    if (!student) throw new AppError('Student not found', 404);

    const cls = await classRepository.findById(class_id);
    if (!cls) throw new AppError('Class not found', 404);

    const session = await academicSessionRepository.findById(academic_session_id);
    if (!session) throw new AppError('Academic session not found', 404);

    // A student cannot enroll twice in the same session (also enforced by a DB unique constraint,
    // but checking here first lets us return a clear error message)
    const existing = await studentEnrollmentRepository.findByStudentAndSession(
      student_id,
      academic_session_id,
    );
    if (existing) {
      throw new AppError('This student is already enrolled in this academic session', 409);
    }

    // ── Check whether the class has sections — per the rule: "class maybe section or not" ──
    const classSections = await sectionRepository.findByClassId(class_id);
    const classHasSections = classSections.length > 0;

    if (classHasSections) {
      if (!section_id) {
        throw new AppError('This class has sections — section_id is required', 400);
      }

      const section = classSections.find((s) => s.id === section_id);
      if (!section) {
        throw new AppError('section_id does not belong to the given class', 400);
      }

      // capacity check — if max_capacity is set, block new enrollments once it is full
      if (section.max_capacity != null) {
        const enrolledCount = await sectionRepository.countEnrolledStudents(section_id);
        if (enrolledCount >= section.max_capacity) {
          throw new AppError(
            `Section "${section.name}" is full (${enrolledCount}/${section.max_capacity})`,
            400,
          );
        }
      }
    } else if (section_id) {
      // the class has no sections, but the caller sent a section_id — invalid input
      throw new AppError('This class has no sections — section_id should not be provided', 400);
    }

    // roll_number is not set here — the ranking/roll engine assigns it later
    return studentEnrollmentRepository.create({
      student_id,
      class_id,
      section_id: classHasSections ? section_id : null,
      academic_session_id,
    });
  },

  async getAll(queryOptions: ListQuery): Promise<Paginated<EnrollmentDetailRow>> {
    const { page, limit, offset } = getPagination(queryOptions);
    const [data, total] = await Promise.all([
      studentEnrollmentRepository.findAll(queryOptions, { limit, offset }),
      studentEnrollmentRepository.countAll(queryOptions),
    ]);
    return { data, meta: buildMeta({ total, page, limit }) };
  },

  async getById(id: string): Promise<EnrollmentDetailRow> {
    const enrollment = await studentEnrollmentRepository.findById(id);
    if (!enrollment) throw new AppError('Enrollment not found', 404);
    return enrollment;
  },

  // section change (transfer) — capacity is re-checked for the new section
  // roll_number cannot be changed here — the ranking/roll engine is authoritative (core/roll.engine.js)
  async update(
    id: string,
    { class_id, section_id }: UpdateEnrollmentInput,
  ): Promise<StudentEnrollmentRow> {
    const enrollment = await this.getById(id);

    class_id = assertUuid(class_id, 'class_id', { required: false });
    section_id = assertUuid(section_id, 'section_id', { required: false });

    const targetClassId = class_id || enrollment.class_id;

    if (section_id !== undefined && section_id !== null) {
      const section = await sectionRepository.findById(section_id);
      if (!section || section.class_id !== targetClassId) {
        throw new AppError('section_id does not belong to the target class', 400);
      }

      if (section.max_capacity != null) {
        const enrolledCount = await sectionRepository.countEnrolledStudents(section_id);
        // if the student is already in this section, they should be excluded from the count — but to keep it simple
        // we use strictly < (so a transfer within the same section won't require an extra slot)
        const alreadyHere = enrollment.section_id === section_id;
        if (!alreadyHere && enrolledCount >= section.max_capacity) {
          throw new AppError(`Section "${section.name}" is full`, 400);
        }
      }
    }

    const updated = await studentEnrollmentRepository.update(id, { class_id, section_id });
    if (!updated) throw new AppError('Enrollment not found', 404);
    return updated;
  },

  async delete(id: string): Promise<{ id: string }> {
    await this.getById(id);
    const deleted = await studentEnrollmentRepository.softDelete(id);
    if (!deleted) throw new AppError('Enrollment not found', 404);
    return deleted;
  },
};
