import { Router } from 'express';
import { subjectController } from './subject.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rbacMiddleware } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /subjects:
 *   get:
 *     tags: [Subjects]
 *     summary: List all subjects (paginated)
 *     description: 'Requires the `SUBJECT_READ` permission. Supports search on `name`/`code` and `sortBy` (name|code|created_at), `sortOrder`.'
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - { name: search, in: query, required: false, schema: { type: string }, description: 'searches on name or code' }
 *       - { name: sortBy, in: query, required: false, schema: { type: string, enum: [name, code, created_at] } }
 *       - { name: sortOrder, in: query, required: false, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200:
 *         description: List of subjects
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { type: array, items: { $ref: '#/components/schemas/Subject' } }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', rbacMiddleware('SUBJECT_READ'), subjectController.getAll);
/**
 * @openapi
 * /subjects/{id}:
 *   get:
 *     tags: [Subjects]
 *     summary: Get a single subject
 *     description: 'Requires the `SUBJECT_READ` permission.'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Subject details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Subject' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', rbacMiddleware('SUBJECT_READ'), subjectController.getById);
/**
 * @openapi
 * /subjects:
 *   post:
 *     tags: [Subjects]
 *     summary: Create a new subject
 *     description: 'Requires the `SUBJECT_CREATE` permission. `code` is optional; if provided it is stored in uppercase. name/code are unique.'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, maxLength: 100, example: 'Mathematics' }
 *               code: { type: string, maxLength: 20, example: 'MATH' }
 *     responses:
 *       201:
 *         description: Subject created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Subject' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.post('/', rbacMiddleware('SUBJECT_CREATE'), subjectController.create);
/**
 * @openapi
 * /subjects/{id}:
 *   patch:
 *     tags: [Subjects]
 *     summary: Update a subject
 *     description: 'Requires the `SUBJECT_UPDATE` permission. All fields are optional — only the fields sent are changed.'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, maxLength: 100, example: 'Mathematics' }
 *               code: { type: string, maxLength: 20, example: 'MATH' }
 *     responses:
 *       200:
 *         description: Subject updated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Subject' }
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
router.patch('/:id', rbacMiddleware('SUBJECT_UPDATE'), subjectController.update);
/**
 * @openapi
 * /subjects/{id}:
 *   delete:
 *     tags: [Subjects]
 *     summary: Delete a subject (soft delete)
 *     description: 'Requires the `SUBJECT_DELETE` permission. It cannot be deleted while assigned to any teacher.'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Subject deleted
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
router.delete('/:id', rbacMiddleware('SUBJECT_DELETE'), subjectController.delete);

export default router;
