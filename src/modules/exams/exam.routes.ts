import { Router } from 'express';
import { examController } from './exam.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rbacMiddleware } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /exams:
 *   get:
 *     tags: [Exams]
 *     summary: List exams (paginated, with filter and search)
 *     description: >-
 *       Requires `EXAM_READ` permission. Filter by `class_id`, `academic_session_id`, `exam_type`,
 *       search by name with `search`, and sort with `sortBy`/`sortOrder`.
 *       Each exam includes class_name and session_name.
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - { name: search, in: query, required: false, schema: { type: string }, description: 'search by exam name' }
 *       - { name: class_id, in: query, required: false, schema: { type: string, format: uuid } }
 *       - { name: academic_session_id, in: query, required: false, schema: { type: string, format: uuid } }
 *       - { name: exam_type, in: query, required: false, schema: { type: string, enum: [ADMISSION, MIDTERM, FINAL, UNIT_TEST] } }
 *       - { name: sortBy, in: query, required: false, schema: { type: string, enum: [name, exam_date, created_at] } }
 *       - { name: sortOrder, in: query, required: false, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200:
 *         description: List of exams
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { type: array, items: { $ref: '#/components/schemas/Exam' } }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', rbacMiddleware('EXAM_READ'), examController.getAll);

/**
 * @openapi
 * /exams/{id}:
 *   get:
 *     tags: [Exams]
 *     summary: Get a single exam's details
 *     description: 'Requires `EXAM_READ` permission. Returns the exam with class_name and session_name.'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Exam details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Exam' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', rbacMiddleware('EXAM_READ'), examController.getById);

/**
 * @openapi
 * /exams:
 *   post:
 *     tags: [Exams]
 *     summary: Create a new exam
 *     description: >-
 *       Requires `EXAM_CREATE` permission. Only `name` is required; the rest are optional.
 *       If `exam_type` is not provided it defaults to `ADMISSION`. A new exam is always created in `DRAFT` status.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, maxLength: 100, example: 'Annual Final Exam 2026' }
 *               class_id: { type: string, format: uuid }
 *               academic_session_id: { type: string, format: uuid }
 *               exam_date: { type: string, format: date, example: '2026-12-01' }
 *               exam_type: { type: string, enum: [ADMISSION, MIDTERM, FINAL, UNIT_TEST], default: ADMISSION }
 *     responses:
 *       201:
 *         description: Exam created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Exam' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/', rbacMiddleware('EXAM_CREATE'), examController.create);

/**
 * @openapi
 * /exams/{id}:
 *   patch:
 *     tags: [Exams]
 *     summary: Update exam details
 *     description: 'Requires `EXAM_UPDATE` permission. Only the fields sent are updated (partial).'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, maxLength: 100 }
 *               class_id: { type: string, format: uuid }
 *               academic_session_id: { type: string, format: uuid }
 *               exam_date: { type: string, format: date }
 *               exam_type: { type: string, enum: [ADMISSION, MIDTERM, FINAL, UNIT_TEST] }
 *     responses:
 *       200:
 *         description: Update successful
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Exam' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:id', rbacMiddleware('EXAM_UPDATE'), examController.update);

/**
 * @openapi
 * /exams/{id}:
 *   delete:
 *     tags: [Exams]
 *     summary: Delete an exam (soft delete)
 *     description: >-
 *       Requires `EXAM_DELETE` permission. Cannot delete if results already exist (delete results first) — returns 400.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Deleted
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
router.delete('/:id', rbacMiddleware('EXAM_DELETE'), examController.delete);

// Publish/unpublish — EXAM_UPDATE permission is sufficient for just these two actions
/**
 * @openapi
 * /exams/{id}/publish:
 *   patch:
 *     tags: [Exams]
 *     summary: Publish an exam (DRAFT → PUBLISHED)
 *     description: >-
 *       Requires `EXAM_UPDATE` permission. To publish, the exam must have a class and academic session and
 *       at least one result entry — otherwise 400. Returns 400 if already PUBLISHED.
 *       When a FINAL or ADMISSION exam is published, ranking is auto-triggered if the conditions are met.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Published exam
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Exam' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:id/publish', rbacMiddleware('EXAM_UPDATE'), examController.publish);

/**
 * @openapi
 * /exams/{id}/unpublish:
 *   patch:
 *     tags: [Exams]
 *     summary: Unpublish and revert to draft (PUBLISHED → DRAFT)
 *     description: 'Requires `EXAM_UPDATE` permission. Returns 400 if already DRAFT.'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Reverted to draft
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Exam' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:id/unpublish', rbacMiddleware('EXAM_UPDATE'), examController.unpublish);

export default router;
