import bcrypt from 'bcryptjs';
import {
  teacherRepository,
  type TeacherAssignmentRow,
  type TeacherListRow,
  type UpdateTeacherData,
} from './teacher.repository.js';
import { userRepository } from '../users/user.repository.js';
import { roleRepository } from '../roles/role.repository.js';
import { AppError } from '../../utils/appError.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { withTransaction } from '../../config/db.js';
import { env } from '../../config/env.js';
import { assertString, assertEnum, assertDate, GENDERS } from '../../utils/validators.js';
import type { ListQuery, Paginated } from '../../types/common.types.js';
import type { Gender, TeacherRow } from '../../types/db.types.js';

export interface CreateTeacherInput {
  full_name: string;
  email: string;
  password: string;
  gender?: Gender;
  phone?: string;
  designation?: string;
  qualification?: string;
  joining_date?: string;
}

export type UpdateTeacherInput = UpdateTeacherData;

/** create() returns the new profile plus the user fields it just wrote. */
export interface CreatedTeacher extends TeacherRow {
  full_name: string;
  email: string;
}

export interface TeacherWithAssignments extends TeacherListRow {
  assignments: TeacherAssignmentRow[];
}

export const teacherService = {
  // Creating a teacher means user account + teacher profile — both together,
  // and if one fails the other should roll back too, hence withTransaction
  async create({
    full_name,
    email,
    password,
    gender,
    phone,
    designation,
    qualification,
    joining_date,
  }: CreateTeacherInput): Promise<CreatedTeacher> {
    full_name = assertString(full_name, 'full_name', { max: 100 });
    email = assertString(email, 'email', { max: 100 });
    password = assertString(password, 'password', { min: 6 });
    gender = assertEnum(gender, 'gender', GENDERS, { required: false });
    phone = assertString(phone, 'phone', { required: false, max: 20 });
    designation = assertString(designation, 'designation', { required: false, max: 100 });
    qualification = assertString(qualification, 'qualification', { required: false });
    joining_date = assertDate(joining_date, 'joining_date', { required: false });

    const email_lc = email.toLowerCase();

    const existing = await userRepository.findByEmail(email_lc);
    if (existing) throw new AppError('Email already in use', 409);

    const teacherRole = await roleRepository.findByName('TEACHER');
    if (!teacherRole) {
      throw new AppError('TEACHER role not found — run db:seed first', 500);
    }

    const hashedPassword = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

    return withTransaction(async (client) => {
      const user = await teacherRepository.createUser(client, {
        full_name,
        email: email_lc,
        password: hashedPassword,
        role_id: teacherRole.id,
        gender,
      });

      const teacher = await teacherRepository.createTeacherProfile(client, {
        user_id: user.id,
        phone,
        designation,
        qualification,
        joining_date,
      });

      return { ...teacher, full_name, email: email_lc };
    });
  },

  async getAll(queryOptions: ListQuery): Promise<Paginated<TeacherListRow>> {
    const { page, limit, offset } = getPagination(queryOptions);
    const [data, total] = await Promise.all([
      teacherRepository.findAll(queryOptions, { limit, offset }),
      teacherRepository.countAll(queryOptions),
    ]);
    return { data, meta: buildMeta({ total, page, limit }) };
  },

  async getById(id: string): Promise<TeacherListRow> {
    const teacher = await teacherRepository.findById(id);
    if (!teacher) throw new AppError('Teacher not found', 404);
    return teacher;
  },

  // teacher profile + all of their subject assignments together
  async getByIdWithAssignments(id: string): Promise<TeacherWithAssignments> {
    const teacher = await this.getById(id);
    const assignments = await teacherRepository.findAssignments(id);
    return { ...teacher, assignments };
  },

  async update(id: string, fields: UpdateTeacherInput): Promise<TeacherRow> {
    await this.getById(id);

    fields.phone = assertString(fields.phone, 'phone', { required: false, max: 20 });
    fields.designation = assertString(fields.designation, 'designation', {
      required: false,
      max: 100,
    });
    fields.qualification = assertString(fields.qualification, 'qualification', { required: false });
    fields.joining_date = assertDate(fields.joining_date, 'joining_date', { required: false });

    const updated = await teacherRepository.update(id, fields);
    if (!updated) throw new AppError('Teacher not found', 404);
    return updated;
  },

  async delete(id: string): Promise<{ id: string; user_id: string | null }> {
    await this.getById(id);

    const hasAssignments = await teacherRepository.hasActiveAssignments(id);
    if (hasAssignments) {
      throw new AppError(
        'Cannot delete teacher — has active subject assignments. Remove assignments first.',
        400,
      );
    }

    const deleted = await teacherRepository.softDelete(id);
    if (!deleted) throw new AppError('Teacher not found', 404);
    return deleted;
  },
};
