import { roleService } from './role.service.js';
import { successResponse } from '../../utils/response.js';
import type { Handler } from '../../types/http.types.js';

type RoleController = Record<
  'create' | 'getAll' | 'getById' | 'update' | 'syncPermissions' | 'delete',
  Handler
>;

export const roleController: RoleController = {
  async create(req, res, next) {
    try {
      const data = await roleService.create(req.body);
      return successResponse(res, { message: 'Role created', data, statusCode: 201 });
    } catch (err) {
      next(err);
    }
  },
  async getAll(req, res, next) {
    try {
      const { data, meta } = await roleService.getAll(req.query);
      return successResponse(res, { message: 'Roles fetched', data, meta });
    } catch (err) {
      next(err);
    }
  },
  async getById(req, res, next) {
    try {
      const data = await roleService.getById(req.params.id);
      return successResponse(res, { message: 'Role fetched', data });
    } catch (err) {
      next(err);
    }
  },
  async update(req, res, next) {
    try {
      const data = await roleService.update(req.params.id, req.body);
      return successResponse(res, { message: 'Role updated', data });
    } catch (err) {
      next(err);
    }
  },
  async syncPermissions(req, res, next) {
    try {
      const data = await roleService.syncPermissions(req.params.id, req.body.permissionIds || []);
      return successResponse(res, { message: 'Permissions synced', data });
    } catch (err) {
      next(err);
    }
  },
  async delete(req, res, next) {
    try {
      await roleService.delete(req.params.id);
      return successResponse(res, { message: 'Role deleted' });
    } catch (err) {
      next(err);
    }
  },
};
