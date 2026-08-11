import { Router } from 'express';
import { academicSessionController } from './academic-session.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rbacMiddleware } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authMiddleware);

// the /active route must come before /:id — otherwise "active" would be treated as an id
/**
 * @openapi
 * /academic-sessions/active:
 *   get:
 *     tags: [Academic-Sessions]
 *     summary: Current active session
 *     description: 'Requires the `SESSION_READ` permission. Returns 404 if there is no active session.'
 *     responses:
 *       200:
 *         description: Active session details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AcademicSession' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/active', rbacMiddleware('SESSION_READ'), academicSessionController.getActive);
/**
 * @openapi
 * /academic-sessions:
 *   get:
 *     tags: [Academic-Sessions]
 *     summary: List all academic sessions (paginated)
 *     description: 'Requires the `SESSION_READ` permission.'
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *     responses:
 *       200:
 *         description: List of sessions
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { type: array, items: { $ref: '#/components/schemas/AcademicSession' } }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', rbacMiddleware('SESSION_READ'), academicSessionController.getAll);
/**
 * @openapi
 * /academic-sessions/{id}:
 *   get:
 *     tags: [Academic-Sessions]
 *     summary: Get a single session
 *     description: 'Requires the `SESSION_READ` permission.'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Session details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AcademicSession' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', rbacMiddleware('SESSION_READ'), academicSessionController.getById);
/**
 * @openapi
 * /academic-sessions:
 *   post:
 *     tags: [Academic-Sessions]
 *     summary: Create a new academic session
 *     description: 'Requires the `SESSION_CREATE` permission. `name` is unique; `start_date` must be ≤ `end_date`.'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, maxLength: 50, example: '2025-2026' }
 *               start_date: { type: string, format: date, example: '2025-01-01' }
 *               end_date: { type: string, format: date, example: '2025-12-31' }
 *               admission_test_enabled: { type: boolean, example: false }
 *     responses:
 *       201:
 *         description: Session created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AcademicSession' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.post('/', rbacMiddleware('SESSION_CREATE'), academicSessionController.create);
/**
 * @openapi
 * /academic-sessions/{id}:
 *   patch:
 *     tags: [Academic-Sessions]
 *     summary: Update a session
 *     description: 'Requires the `SESSION_UPDATE` permission. All fields are optional. `is_active` cannot be changed here — use the activate/deactivate route.'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, maxLength: 50, example: '2025-2026' }
 *               start_date: { type: string, format: date }
 *               end_date: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Session updated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AcademicSession' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.patch('/:id', rbacMiddleware('SESSION_UPDATE'), academicSessionController.update);
/**
 * @openapi
 * /academic-sessions/{id}:
 *   delete:
 *     tags: [Academic-Sessions]
 *     summary: Delete a session (soft delete)
 *     description: 'Requires the `SESSION_DELETE` permission. An active session cannot be deleted — deactivate it first.'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Session deleted
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:id', rbacMiddleware('SESSION_DELETE'), academicSessionController.delete);
/**
 * @openapi
 * /academic-sessions/{id}/activate:
 *   patch:
 *     tags: [Academic-Sessions]
 *     summary: Activate a session
 *     description: 'Requires the `SESSION_UPDATE` permission. Only one session is active at a time — activating this one deactivates the rest (atomic).'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Session activated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AcademicSession' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:id/activate', rbacMiddleware('SESSION_UPDATE'), academicSessionController.activate);
/**
 * @openapi
 * /academic-sessions/{id}/deactivate:
 *   patch:
 *     tags: [Academic-Sessions]
 *     summary: Deactivate a session
 *     description: 'Requires the `SESSION_UPDATE` permission. If already inactive, returns the session unchanged.'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Session deactivated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AcademicSession' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch(
  '/:id/deactivate',
  rbacMiddleware('SESSION_UPDATE'),
  academicSessionController.deactivate,
);
/**
 * @openapi
 * /academic-sessions/{id}/admission-test:
 *   patch:
 *     tags: [Academic-Sessions]
 *     summary: Turn a session's admission test on/off
 *     description: 'Requires the `SESSION_UPDATE` permission. `admission_test_enabled` (boolean) is required.'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [admission_test_enabled]
 *             properties:
 *               admission_test_enabled: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: Admission test status updated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AcademicSession' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch(
  '/:id/admission-test',
  rbacMiddleware('SESSION_UPDATE'),
  academicSessionController.toggleAdmissionTest,
);

export default router;
