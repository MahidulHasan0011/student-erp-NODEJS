import { permissionRepository } from './permission.repository.js';
import { AppError } from '../../utils/appError.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { assertString } from '../../utils/validators.js';
import type { ListQuery, Paginated } from '../../types/common.types.js';
import type { PermissionRow } from '../../types/db.types.js';

export interface PermissionInput {
  name: string;
}

export const permissionService = {
  async create({ name }: PermissionInput): Promise<PermissionRow> {
    name = assertString(name, 'name', { max: 100 }).toUpperCase();
    const existing = await permissionRepository.findByName(name);
    if (existing) throw new AppError(`Permission "${name}" already exists`, 409);
    return permissionRepository.create({ name });
  },

  async getAll(queryOptions: ListQuery): Promise<Paginated<PermissionRow>> {
    const { page, limit, offset } = getPagination(queryOptions);

    const [data, total] = await Promise.all([
      permissionRepository.findAll(queryOptions, { limit, offset }),
      permissionRepository.countAll(queryOptions),
    ]);

    return { data, meta: buildMeta({ total, page, limit }) };
  },

  async getById(id: string): Promise<PermissionRow> {
    const permission = await permissionRepository.findById(id);
    if (!permission) throw new AppError('Permission not found', 404);
    return permission;
  },

  async update(id: string, { name }: PermissionInput): Promise<PermissionRow> {
    await this.getById(id);
    // name is the only updatable + NOT NULL column in permissions, so it is required on update too
    name = assertString(name, 'name', { max: 100 }).toUpperCase();
    const existing = await permissionRepository.findByName(name);
    if (existing && existing.id !== id)
      throw new AppError(`Permission "${name}" already exists`, 409);
    const updated = await permissionRepository.update(id, { name });
    if (!updated) throw new AppError('Permission not found', 404);
    return updated;
  },

  async delete(id: string): Promise<{ id: string }> {
    const deleted = await permissionRepository.delete(id);
    if (!deleted) throw new AppError('Permission not found', 404);
    return deleted;
  },
};
