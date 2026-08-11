import { Router } from 'express';
import { rolePermissionController } from './role-permission.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rbacMiddleware } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authMiddleware);

// Read — ROLE_READ is enough for everyone, no need to create a separate permission
/**
 * @openapi
 * /role-permissions/role/{roleId}:
 *   get:
 *     tags: [Role-Permissions]
 *     summary: View all permissions of a role
 *     description: 'Requires `ROLE_READ` permission. Returns the list of permissions assigned to the given role.'
 *     parameters:
 *       - { name: roleId, in: path, required: true, schema: { type: string, format: uuid }, description: 'Role UUID' }
 *     responses:
 *       200:
 *         description: Role permission list
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/RolePermission' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/role/:roleId', rbacMiddleware('ROLE_READ'), rolePermissionController.getByRole);

/**
 * @openapi
 * /role-permissions/permission/{permissionId}:
 *   get:
 *     tags: [Role-Permissions]
 *     summary: View which roles a permission belongs to
 *     description: 'Requires `ROLE_READ` permission. Returns the list of roles the given permission is assigned to.'
 *     parameters:
 *       - { name: permissionId, in: path, required: true, schema: { type: string, format: uuid }, description: 'Permission UUID' }
 *     responses:
 *       200:
 *         description: List of roles holding the permission
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/RolePermission' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/permission/:permissionId',
  rbacMiddleware('ROLE_READ'),
  rolePermissionController.getByPermission,
);

// Modify — requires ROLE_UPDATE permission (like syncPermissions in role.routes.js)
/**
 * @openapi
 * /role-permissions:
 *   post:
 *     tags: [Role-Permissions]
 *     summary: Assign a permission to a role
 *     description: 'Requires `ROLE_UPDATE` permission. Returns 409 if it is already assigned.'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId, permissionId]
 *             properties:
 *               roleId: { type: string, format: uuid }
 *               permissionId: { type: string, format: uuid }
 *     responses:
 *       201:
 *         description: Permission assigned to the role
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/RolePermission' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/', rbacMiddleware('ROLE_UPDATE'), rolePermissionController.assign);

/**
 * @openapi
 * /role-permissions/bulk:
 *   post:
 *     tags: [Role-Permissions]
 *     summary: Assign multiple permissions to a role at once
 *     description: 'Requires `ROLE_UPDATE` permission. Each id is processed individually — successes are reported under assigned, failures/duplicates under skipped (partial success).'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId, permissionIds]
 *             properties:
 *               roleId: { type: string, format: uuid }
 *               permissionIds:
 *                 type: array
 *                 minItems: 1
 *                 items: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Bulk assignment process completed
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         assigned: { type: array, items: { $ref: '#/components/schemas/RolePermission' } }
 *                         skipped:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               permissionId: { type: string, format: uuid }
 *                               reason: { type: string }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/bulk', rbacMiddleware('ROLE_UPDATE'), rolePermissionController.assignBulk);

/**
 * @openapi
 * /role-permissions:
 *   delete:
 *     tags: [Role-Permissions]
 *     summary: Remove a permission from a role
 *     description: 'Requires `ROLE_UPDATE` permission. Returns 404 if the permission is not assigned.'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId, permissionId]
 *             properties:
 *               roleId: { type: string, format: uuid }
 *               permissionId: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Permission removed from the role
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/', rbacMiddleware('ROLE_UPDATE'), rolePermissionController.revoke);

export default router;
