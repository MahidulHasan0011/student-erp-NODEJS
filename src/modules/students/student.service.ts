import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import {
  studentRepository,
  type CurrentEnrollmentRow,
  type StudentListRow,
  type UpdateStudentData,
} from './student.repository.js';
import { userRepository } from '../users/user.repository.js';
import { roleRepository } from '../roles/role.repository.js';
import { AppError } from '../../utils/appError.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { withTransaction } from '../../config/db.js';
import { env } from '../../config/env.js';
import { assertString, assertEnum, assertDate, GENDERS } from '../../utils/validators.js';
import type { ListQuery, Paginated } from '../../types/common.types.js';
import type { Gender, StudentRow } from '../../types/db.types.js';

// Input DTOs state what the service EXPECTS; req.body is `any` at the Express boundary,
// so the assert* calls below remain the actual runtime gate.
export interface CreateStudentInput {
  full_name: string;
  email: string;
  password: string;
  gender?: Gender;
  date_of_birth?: string;
  guardian_name?: string;
  guardian_phone?: string;
  address?: string;
}

export type UpdateStudentInput = UpdateStudentData;

/** create() returns the new profile plus the user fields it just wrote. */
export interface CreatedStudent extends StudentRow {
  full_name: string;
  email: string;
}

export interface StudentWithEnrollment extends StudentListRow {
  current_enrollment: CurrentEnrollmentRow | null;
}

// student_code format: STU-2026-001 (year + sequential number)
const generateStudentCode = async (client: PoolClient): Promise<string> => {
  const year = new Date().getFullYear();
  const { rows } = await client.query<{ count: string }>(
    `SELECT COUNT(*) FROM students WHERE student_code LIKE $1`,
    [`STU-${year}-%`],
  );
  const nextSeq = parseInt(rows[0].count) + 1;
  return `STU-${year}-${String(nextSeq).padStart(3, '0')}`;
};

export const studentService = {
  // Create user account + student profile together — rollback if either fails (same pattern as teacher.service.js)
  async create({
    full_name,
    email,
    password,
    gender,
    date_of_birth,
    guardian_name,
    guardian_phone,
    address,
  }: CreateStudentInput): Promise<CreatedStudent> {
    full_name = assertString(full_name, 'full_name', { max: 100 });
    email = assertString(email, 'email', { max: 100 });
    password = assertString(password, 'password', { min: 6 });
    gender = assertEnum(gender, 'gender', GENDERS, { required: false });
    date_of_birth = assertDate(date_of_birth, 'date_of_birth', { required: false });
    guardian_name = assertString(guardian_name, 'guardian_name', { required: false, max: 100 });
    guardian_phone = assertString(guardian_phone, 'guardian_phone', { required: false, max: 20 });
    address = assertString(address, 'address', { required: false });

    const email_lc = email.toLowerCase();

    const existing = await userRepository.findByEmail(email_lc);
    if (existing) throw new AppError('Email already in use', 409);

    const studentRole = await roleRepository.findByName('STUDENT');
    if (!studentRole) {
      throw new AppError('STUDENT role not found — run db:seed first', 500);
    }

    const hashedPassword = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

    return withTransaction(async (client) => {
      const user = await studentRepository.createUser(client, {
        full_name,
        email: email_lc,
        password: hashedPassword,
        role_id: studentRole.id,
        gender,
      });

      const student_code = await generateStudentCode(client);

      const student = await studentRepository.createStudentProfile(client, {
        user_id: user.id,
        student_code,
        date_of_birth,
        guardian_name,
        guardian_phone,
        address,
      });

      return { ...student, full_name, email: email_lc };
    });
  },

  async getAll(queryOptions: ListQuery): Promise<Paginated<StudentListRow>> {
    const { page, limit, offset } = getPagination(queryOptions);
    const [data, total] = await Promise.all([
      studentRepository.findAll(queryOptions, { limit, offset }),
      studentRepository.countAll(queryOptions),
    ]);
    return { data, meta: buildMeta({ total, page, limit }) };
  },

  // Explicit return types below: these methods call each other via `this`, which makes
  // an inferred return type circular.
  async getById(id: string): Promise<StudentListRow> {
    const student = await studentRepository.findById(id);
    if (!student) throw new AppError('Student not found', 404);
    return student;
  },

  // profile + current session enrollment (class/section/roll) together
  async getByIdWithEnrollment(id: string): Promise<StudentWithEnrollment> {
    const student = await this.getById(id);
    const enrollment = await studentRepository.findCurrentEnrollment(id);
    return { ...student, current_enrollment: enrollment };
  },

  async update(id: string, fields: UpdateStudentInput): Promise<StudentRow> {
    await this.getById(id);

    fields.date_of_birth = assertDate(fields.date_of_birth, 'date_of_birth', { required: false });
    fields.guardian_name = assertString(fields.guardian_name, 'guardian_name', {
      required: false,
      max: 100,
    });
    fields.guardian_phone = assertString(fields.guardian_phone, 'guardian_phone', {
      required: false,
      max: 20,
    });
    fields.address = assertString(fields.address, 'address', { required: false });

    const updated = await studentRepository.update(id, fields);
    if (!updated) throw new AppError('Student not found', 404);
    return updated;
  },

  async delete(id: string): Promise<{ id: string; user_id: string | null }> {
    await this.getById(id);

    const hasEnrollments = await studentRepository.hasEnrollments(id);
    if (hasEnrollments) {
      throw new AppError(
        'Cannot delete student — enrollment records exist. Remove enrollments first.',
        400,
      );
    }

    const deleted = await studentRepository.softDelete(id);
    if (!deleted) throw new AppError('Student not found', 404);
    return deleted;
  },
};
