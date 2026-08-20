import bcrypt from 'bcryptjs';
import {
  ALLOWED_UPDATE_FIELDS,
  userRepository,
  type UpdatedUserRow,
  type UpdateUserData,
  type UserListRow,
} from './user.repository.js';
import { roleRepository } from '../roles/role.repository.js';
import { AppError } from '../../utils/appError.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { env } from '../../config/env.js';
import {
  assertString,
  assertUuid,
  assertEnum,
  assertHasUpdates,
  GENDERS,
} from '../../utils/validators.js';
import type { ListQuery, Paginated } from '../../types/common.types.js';
import type { Gender, UserRow } from '../../types/db.types.js';

export interface CreateUserInput {
  full_name: string;
  email: string;
  password: string;
  role_id: string;
  gender?: Gender;
}

export type UpdateUserInput = UpdateUserData;

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export const userService = {
  async create({ full_name, email, password, role_id, gender }: CreateUserInput): Promise<UserRow> {
    full_name = assertString(full_name, 'full_name', { max: 100 });
    email = assertString(email, 'email', { max: 100 }).toLowerCase();
    password = assertString(password, 'password', { min: 6 });
    role_id = assertUuid(role_id, 'role_id');
    gender = assertEnum(gender, 'gender', GENDERS, { required: false });

    const existing = await userRepository.findByEmail(email);
    if (existing) throw new AppError('Email already in use', 409);

    const role = await roleRepository.findById(role_id);
    if (!role) throw new AppError('Role not found', 404);

    const hashedPassword = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

    return userRepository.create({
      full_name,
      email,
      password: hashedPassword,
      role_id,
      gender,
    });
  },

  async getAll(queryOptions: ListQuery): Promise<Paginated<UserListRow>> {
    const { page, limit, offset } = getPagination(queryOptions);
    const [data, total] = await Promise.all([
      userRepository.findAll(queryOptions, { limit, offset }),
      userRepository.countAll(queryOptions),
    ]);
    return { data, meta: buildMeta({ total, page, limit }) };
  },

  async getById(id: string): Promise<UserListRow> {
    const user = await userRepository.findById(id);
    if (!user) throw new AppError('User not found', 404);
    return user;
  },

  async update(id: string, fields: UpdateUserInput): Promise<UpdatedUserRow> {
    await this.getById(id);

    if (fields.full_name !== undefined) {
      fields.full_name = assertString(fields.full_name, 'full_name', { max: 100 });
    }

    if (fields.gender !== undefined) {
      fields.gender = assertEnum(fields.gender, 'gender', GENDERS, { required: false });
    }

    if (fields.email !== undefined) {
      fields.email = assertString(fields.email, 'email', { max: 100 }).toLowerCase();
      const existing = await userRepository.findByEmail(fields.email);
      if (existing && existing.id !== id) throw new AppError('Email already in use', 409);
    }

    if (fields.role_id !== undefined) {
      fields.role_id = assertUuid(fields.role_id, 'role_id');
      const role = await roleRepository.findById(fields.role_id);
      if (!role) throw new AppError('Role not found', 404);
    }

    assertHasUpdates(fields, ALLOWED_UPDATE_FIELDS);

    const updated = await userRepository.update(id, fields);
    if (!updated) throw new AppError('User not found', 404);
    return updated;
  },

  async changePassword(
    id: string,
    { currentPassword, newPassword }: ChangePasswordInput,
  ): Promise<void> {
    currentPassword = assertString(currentPassword, 'currentPassword');
    newPassword = assertString(newPassword, 'newPassword', { min: 6 });

    const user = await userRepository.findWithPassword(id);
    if (!user) throw new AppError('User not found', 404);

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) throw new AppError('Current password is incorrect', 400);

    const hashed = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
    await userRepository.updatePassword(id, hashed);
  },

  async resetPassword(id: string, newPassword: string): Promise<void> {
    await this.getById(id);
    const hashed = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
    await userRepository.updatePassword(id, hashed);
  },

  async toggleActive(id: string, is_active: boolean): Promise<{ id: string; is_active: boolean }> {
    const updated = await userRepository.toggleActive(id, is_active);
    if (!updated) throw new AppError('User not found', 404);
    return updated;
  },

  async delete(id: string): Promise<{ id: string }> {
    const deleted = await userRepository.softDelete(id);
    if (!deleted) throw new AppError('User not found', 404);
    return deleted;
  },
};
