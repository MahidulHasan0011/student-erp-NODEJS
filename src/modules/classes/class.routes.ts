import { Router } from 'express';
import { classController } from './class.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rbacMiddleware } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /classes:
 *   get:
 *     tags: [Classes]
 *     summary: List all classes (pagination + search)
 *     description: |
 *       Returns a paginated list of classes. Requires the `CLASS_READ` permission.
 *       Use `search` to search by name.
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - name: search
 *         in: query
 *         required: false
 *         description: keyword search on class name
 *         schema: { type: string }
 *       - name: sortBy
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [name, created_at], default: created_at }
 *       - name: sortOrder
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [asc, desc] }
 *     responses:
 *       200:
 *         description: List of classes
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Class' }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', rbacMiddleware('CLASS_READ'), classController.getAll);

/**
 * @openapi
 * /classes/{id}:
 *   get:
 *     tags: [Classes]
 *     summary: Get a single class by ID
 *     description: Returns the details of the specified class. Requires the `CLASS_READ` permission.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Class details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Class' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', rbacMiddleware('CLASS_READ'), classController.getById);

/**
 * @openapi
 * /classes/{id}/sections:
 *   get:
 *     tags: [Classes]
 *     summary: Class details + its section list
 *     description: |
 *       Returns the class details together with all of its sections (id, name, max_capacity).
 *       Requires the `CLASS_READ` permission.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Class details with sections
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       allOf:
 *                         - $ref: '#/components/schemas/Class'
 *                         - type: object
 *                           properties:
 *                             sections:
 *                               type: array
 *                               items: { $ref: '#/components/schemas/Section' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id/sections', rbacMiddleware('CLASS_READ'), classController.getWithSections);

/**
 * @openapi
 * /classes:
 *   post:
 *     tags: [Classes]
 *     summary: Create a new class
 *     description: Creates a new class. The name must be unique. Requires the `CLASS_CREATE` permission.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, maxLength: 50, example: 'Class Six' }
 *     responses:
 *       201:
 *         description: Class created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Class' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.post('/', rbacMiddleware('CLASS_CREATE'), classController.create);

/**
 * @openapi
 * /classes/{id}:
 *   patch:
 *     tags: [Classes]
 *     summary: Update a class name
 *     description: |
 *       Updates the class name (name is the only updatable field, so it is required).
 *       The new name must be unique. Requires the `CLASS_UPDATE` permission.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, maxLength: 50, example: 'Class Seven' }
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
 *                     data: { $ref: '#/components/schemas/Class' }
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
router.patch('/:id', rbacMiddleware('CLASS_UPDATE'), classController.update);

/**
 * @openapi
 * /classes/{id}:
 *   delete:
 *     tags: [Classes]
 *     summary: Delete a class (soft delete)
 *     description: |
 *       Soft-deletes the class. It cannot be deleted while sections are attached (400).
 *       Requires the `CLASS_DELETE` permission.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Class deleted
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       400:
 *         description: Could not delete because sections are attached
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:id', rbacMiddleware('CLASS_DELETE'), classController.delete);

export default router;
