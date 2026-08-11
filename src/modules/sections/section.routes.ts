import { Router } from 'express';
import { sectionController } from './section.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rbacMiddleware } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /sections:
 *   get:
 *     tags: [Sections]
 *     summary: List all sections (pagination + search + filter)
 *     description: |
 *       Returns a paginated list of sections (including class_name). Requires the `SECTION_READ` permission.
 *       Use `search` to search by name; use `class_id` to filter by a specific class.
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - name: search
 *         in: query
 *         required: false
 *         description: keyword search on section name
 *         schema: { type: string }
 *       - name: class_id
 *         in: query
 *         required: false
 *         description: filter sections by a specific class
 *         schema: { type: string, format: uuid }
 *       - name: sortBy
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [name, max_capacity, created_at], default: created_at }
 *       - name: sortOrder
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [asc, desc] }
 *     responses:
 *       200:
 *         description: List of sections
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Section' }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', rbacMiddleware('SECTION_READ'), sectionController.getAll);

/**
 * @openapi
 * /sections/{id}:
 *   get:
 *     tags: [Sections]
 *     summary: Get a single section by ID
 *     description: Returns the details of the specified section (including class_name). Requires the `SECTION_READ` permission.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Section details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Section' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', rbacMiddleware('SECTION_READ'), sectionController.getById);

/**
 * @openapi
 * /sections/{id}/occupancy:
 *   get:
 *     tags: [Sections]
 *     summary: Section seat occupancy details
 *     description: |
 *       Returns the section details along with enrolled_count, available_seats and is_full.
 *       A null max_capacity is treated as unlimited. Requires the `SECTION_READ` permission.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Section + occupancy details
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
 *                         enrolled_count: { type: integer, example: 28 }
 *                         available_seats: { type: integer, nullable: true, example: 12 }
 *                         is_full: { type: boolean, example: false }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id/occupancy', rbacMiddleware('SECTION_READ'), sectionController.getOccupancy);

/**
 * @openapi
 * /sections:
 *   post:
 *     tags: [Sections]
 *     summary: Create a new section
 *     description: |
 *       Creates a new section under a class. The name is converted to uppercase
 *       and must be unique within the same class. Requires the `SECTION_CREATE` permission.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [class_id, name]
 *             properties:
 *               class_id: { type: string, format: uuid, example: '11111111-1111-1111-1111-111111111111' }
 *               name: { type: string, maxLength: 20, example: 'A' }
 *               max_capacity: { type: integer, minimum: 1, nullable: true, example: 40 }
 *     responses:
 *       201:
 *         description: Section created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Section' }
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
router.post('/', rbacMiddleware('SECTION_CREATE'), sectionController.create);

/**
 * @openapi
 * /sections/{id}:
 *   patch:
 *     tags: [Sections]
 *     summary: Update a section
 *     description: |
 *       Updates the section's name and/or max_capacity. max_capacity cannot be set lower
 *       than the number of already enrolled students (400). Requires the `SECTION_UPDATE` permission.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, maxLength: 20, example: 'B' }
 *               max_capacity: { type: integer, minimum: 1, example: 45 }
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
 *                     data: { $ref: '#/components/schemas/Section' }
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
router.patch('/:id', rbacMiddleware('SECTION_UPDATE'), sectionController.update);

/**
 * @openapi
 * /sections/{id}:
 *   delete:
 *     tags: [Sections]
 *     summary: Delete a section (soft delete)
 *     description: |
 *       Soft-deletes the section. It cannot be deleted while any student is enrolled (400).
 *       Requires the `SECTION_DELETE` permission.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Section deleted
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       400:
 *         description: Could not delete because students are enrolled
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
router.delete('/:id', rbacMiddleware('SECTION_DELETE'), sectionController.delete);

export default router;
