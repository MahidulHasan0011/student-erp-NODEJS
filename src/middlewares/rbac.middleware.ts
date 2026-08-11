// work Flow

// rbacMiddleware
//     ↓
// roleService.getCachedPermissions()
//     ↓
// permissionEngine.resolvePermissions()
//     ↓
// Redis Cache
//     ↓
// roleRepository.getPermissionNames()

import type { RequestHandler } from 'express';
import { roleService } from '../modules/roles/role.service.js';
import { errorResponse } from '../utils/response.js';

/**
 * Guards a route behind one or more permissions — the user needs ANY of them.
 * Returns a handler, so it is used as rbacMiddleware('STUDENT_READ') in the route chain.
 */
export const rbacMiddleware = (requiredPermissions: string | string[]): RequestHandler => {
  const perms = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];

  return async (req, res, next) => {
    try {
      if (!req.user?.roleId) {
        return errorResponse(res, { message: 'Unauthorized', statusCode: 401 });
      }

      const userPerms: string[] = await roleService.getCachedPermissions(req.user.roleId);
      const hasPermission = perms.some((p) => userPerms.includes(p));

      if (!hasPermission) {
        return errorResponse(res, {
          message: `Access denied. Required: ${perms.join(' or ')}`,
          statusCode: 403,
        });
      }

      req.permissions = userPerms;
      next();
    } catch (err) {
      next(err);
    }
  };
};
