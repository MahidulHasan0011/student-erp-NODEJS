import { Router } from 'express';
import { errorLogController } from './error-log.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rbacMiddleware } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authMiddleware);

// error logs contain stack traces and request context — so only SUPER_ADMIN is granted this permission (seed.sql)
/**
 * @openapi
 * /error-logs:
 *   get:
 *     tags: [Error-Logs]
 *     summary: list server error logs (requires ERROR_LOG_READ permission)
 *     description: >
 *       Paginated list of error logs. Since they contain stack traces and request context,
 *       usually only SUPER_ADMIN holds this permission. Required permission — ERROR_LOG_READ.
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - name: search
 *         in: query
 *         required: false
 *         description: searches in message and path
 *         schema: { type: string }
 *       - name: status_code
 *         in: query
 *         required: false
 *         schema: { type: integer, example: 500 }
 *       - name: user_id
 *         in: query
 *         required: false
 *         schema: { type: string, format: uuid }
 *       - name: method
 *         in: query
 *         required: false
 *         schema: { type: string, example: POST }
 *       - name: is_operational
 *         in: query
 *         required: false
 *         schema: { type: boolean }
 *       - name: sortBy
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [created_at, status_code], default: created_at }
 *       - name: sortOrder
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [asc, desc] }
 *     responses:
 *       200:
 *         description: error log list
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/ErrorLog' }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', rbacMiddleware('ERROR_LOG_READ'), errorLogController.getAll);
/**
 * @openapi
 * /error-logs/{id}:
 *   get:
 *     tags: [Error-Logs]
 *     summary: details of a single error log (requires ERROR_LOG_READ permission)
 *     description: Required permission — ERROR_LOG_READ.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: error log information
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/ErrorLog' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', rbacMiddleware('ERROR_LOG_READ'), errorLogController.getById);
/**
 * @openapi
 * /error-logs:
 *   delete:
 *     tags: [Error-Logs]
 *     summary: clear all (or old) error logs (requires ERROR_LOG_DELETE permission)
 *     description: >
 *       Soft-deletes all error logs and returns how many were deleted. If `?before=ISODate` is
 *       given, only logs created before that date are deleted. Required permission — ERROR_LOG_DELETE.
 *     parameters:
 *       - name: before
 *         in: query
 *         required: false
 *         description: only logs created before this ISO date-time will be deleted
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: logs cleared
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
 *                         cleared: { type: integer, example: 42 }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.delete('/', rbacMiddleware('ERROR_LOG_DELETE'), errorLogController.clear); // ?before=ISODate deletes only the older ones
/**
 * @openapi
 * /error-logs/{id}:
 *   delete:
 *     tags: [Error-Logs]
 *     summary: soft-delete a single error log (requires ERROR_LOG_DELETE permission)
 *     description: Required permission — ERROR_LOG_DELETE.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: error log deleted
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:id', rbacMiddleware('ERROR_LOG_DELETE'), errorLogController.delete);

export default router;
