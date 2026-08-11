import { Router } from 'express';
import { studentEnrollmentController } from './student-enrollment.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rbacMiddleware } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /enrollments:
 *   get:
 *     tags: [Enrollments]
 *     summary: List all enrollments (paginated)
 *     description: 'Requires the `ENROLLMENT_READ` permission. Supports filtering by `class_id`, `section_id`, `academic_session_id` and `sortBy` (roll_number|created_at).'
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - { name: class_id, in: query, required: false, schema: { type: string, format: uuid } }
 *       - { name: section_id, in: query, required: false, schema: { type: string, format: uuid } }
 *       - { name: academic_session_id, in: query, required: false, schema: { type: string, format: uuid } }
 *       - { name: sortBy, in: query, required: false, schema: { type: string, enum: [roll_number, created_at] } }
 *       - { name: sortOrder, in: query, required: false, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200:
 *         description: List of enrollments (with student/class/section/session names)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { type: array, items: { $ref: '#/components/schemas/Enrollment' } }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', rbacMiddleware('ENROLLMENT_READ'), studentEnrollmentController.getAll);
/**
 * @openapi
 * /enrollments/{id}:
 *   get:
 *     tags: [Enrollments]
 *     summary: Get a single enrollment
 *     description: 'Requires the `ENROLLMENT_READ` permission.'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Enrollment details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Enrollment' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', rbacMiddleware('ENROLLMENT_READ'), studentEnrollmentController.getById);
/**
 * @openapi
 * /enrollments:
 *   post:
 *     tags: [Enrollments]
 *     summary: Enroll a student into a class/session
 *     description: >
 *       Requires the `ENROLLMENT_CREATE` permission. A student cannot be enrolled twice in the same session.
 *       `section_id` is required when the class has sections (blocked if the section is at capacity); it must not be provided when the class has no sections.
 *       `enrollment_type` is validated but not persisted; `roll_number` is not set here (the ranking engine assigns it).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [student_id, class_id, academic_session_id]
 *             properties:
 *               student_id: { type: string, format: uuid }
 *               class_id: { type: string, format: uuid }
 *               academic_session_id: { type: string, format: uuid }
 *               section_id: { type: string, format: uuid, description: 'Required when the class has sections' }
 *               enrollment_type: { type: string, enum: [OLD, NEW] }
 *     responses:
 *       201:
 *         description: Student enrolled
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Enrollment' }
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
router.post('/', rbacMiddleware('ENROLLMENT_CREATE'), studentEnrollmentController.create);
/**
 * @openapi
 * /enrollments/{id}:
 *   patch:
 *     tags: [Enrollments]
 *     summary: Update enrollment (class/section transfer)
 *     description: >
 *       Requires the `ENROLLMENT_UPDATE` permission. Only `class_id` and `section_id` can be changed (both optional).
 *       Capacity is re-checked for the new section; `roll_number` cannot be changed here.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               class_id: { type: string, format: uuid }
 *               section_id: { type: string, format: uuid, nullable: true }
 *     responses:
 *       200:
 *         description: Enrollment updated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Enrollment' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:id', rbacMiddleware('ENROLLMENT_UPDATE'), studentEnrollmentController.update);
/**
 * @openapi
 * /enrollments/{id}:
 *   delete:
 *     tags: [Enrollments]
 *     summary: Delete an enrollment (soft delete)
 *     description: 'Deletion requires the `ENROLLMENT_UPDATE` permission, not `ENROLLMENT_DELETE`.'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Enrollment deleted
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
router.delete('/:id', rbacMiddleware('ENROLLMENT_UPDATE'), studentEnrollmentController.delete);

export default router;
