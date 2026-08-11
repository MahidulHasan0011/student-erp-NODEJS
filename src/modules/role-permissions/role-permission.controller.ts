import { rolePermissionService } from './role-permission.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import type { Handler } from '../../types/http.types.js';

type RolePermissionController = Record<
  'getByRole' | 'getByPermission' | 'assign' | 'assignBulk' | 'revoke',
  Handler
>;

export const rolePermissionController: RolePermissionController = {
  // GET /role-permissions/role/:roleId
  async getByRole(req, res, next) {
    try {
      const data = await rolePermissionService.getByRole(req.params.roleId);
      return successResponse(res, { message: "Role's permissions fetched", data });
    } catch (err) {
      next(err);
    }
  },

  // GET /role-permissions/permission/:permissionId
  async getByPermission(req, res, next) {
    try {
      const data = await rolePermissionService.getByPermission(req.params.permissionId);
      return successResponse(res, { message: "Permission's roles fetched", data });
    } catch (err) {
      next(err);
    }
  },

  // POST /role-permissions  { roleId, permissionId }
  async assign(req, res, next) {
    try {
      const { roleId, permissionId } = req.body;
      if (!roleId || !permissionId) {
        return errorResponse(res, {
          message: 'roleId and permissionId are required',
          statusCode: 400,
        });
      }
      const data = await rolePermissionService.assign(roleId, permissionId);
      return successResponse(res, {
        message: 'Permission assigned to role',
        data,
        statusCode: 201,
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /role-permissions/bulk  { roleId, permissionIds: [...] }
  async assignBulk(req, res, next) {
    try {
      const { roleId, permissionIds } = req.body;
      if (!roleId || !Array.isArray(permissionIds) || !permissionIds.length) {
        return errorResponse(res, {
          message: 'roleId and a non-empty permissionIds array are required',
          statusCode: 400,
        });
      }
      const data = await rolePermissionService.assignBulk(roleId, permissionIds);
      return successResponse(res, { message: 'Bulk assignment processed', data });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /role-permissions  { roleId, permissionId }
  async revoke(req, res, next) {
    try {
      const { roleId, permissionId } = req.body;
      if (!roleId || !permissionId) {
        return errorResponse(res, {
          message: 'roleId and permissionId are required',
          statusCode: 400,
        });
      }
      await rolePermissionService.revoke(roleId, permissionId);
      return successResponse(res, { message: 'Permission revoked from role' });
    } catch (err) {
      next(err);
    }
  },
};
