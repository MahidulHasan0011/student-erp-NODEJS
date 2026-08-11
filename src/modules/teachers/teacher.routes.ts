import { Router } from 'express';
import { teacherController } from './teacher.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rbacMiddleware } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /teachers:
 *   get:
 *     tags: [Teachers]
 *     summary: List all teachers (pagination + search)
 *     description: |
 *       Returns a paginated list of teachers. Requires the `TEACHER_READ` permission.
 *       `search` matches against full_name, email, and phone.
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - name: search
 *         in: query
 *         required: false
 *         description: keyword search across full_name / email / phone
 *         schema: { type: string }
 *       - name: sortBy
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [full_name, joining_date, created_at], default: created_at }
 *       - name: sortOrder
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [asc, desc] }
 *     responses:
 *       200:
 *         description: List of teachers
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Teacher' }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', rbacMiddleware('TEACHER_READ'), teacherController.getAll);

/**
 * @openapi
 * /teachers/{id}:
 *   get:
 *     tags: [Teachers]
 *     summary: Get a single teacher by ID
 *     description: Returns the profile of the specified teacher. Requires the `TEACHER_READ` permission.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Teacher details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Teacher' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', rbacMiddleware('TEACHER_READ'), teacherController.getById);

/**
 * @openapi
 * /teachers/{id}/assignments:
 *   get:
 *     tags: [Teachers]
 *     summary: Teacher profile + list of their subject assignments
 *     description: |
 *       Returns the teacher's profile along with all of their subject assignments.
 *       Requires the `TEACHER_READ` permission.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Teacher details including assignments
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       allOf:
 *                         - $ref: '#/components/schemas/Teacher'
 *                         - type: object
 *                           properties:
 *                             assignments:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   id: { type: string, format: uuid }
 *                                   class_id: { type: string, format: uuid }
 *                                   class_name: { type: string }
 *                                   section_id: { type: string, format: uuid, nullable: true }
 *                                   section_name: { type: string, nullable: true }
 *                                   subject_id: { type: string, format: uuid }
 *                                   subject_name: { type: string }
 *                                   academic_session_id: { type: string, format: uuid }
 *                                   session_name: { type: string }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/:id/assignments',
  rbacMiddleware('TEACHER_READ'),
  teacherController.getWithAssignments,
);

/**
 * @openapi
 * /teachers:
 *   post:
 *     tags: [Teachers]
 *     summary: Create a new teacher (user account + profile)
 *     description: |
 *       Creates a user account and teacher profile together.
 *       Requires the `TEACHER_CREATE` permission.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, email, password]
 *             properties:
 *               full_name: { type: string, maxLength: 100, example: Mr. Karim }
 *               email: { type: string, format: email, maxLength: 100, example: karim@school.com }
 *               password: { type: string, format: password, minLength: 6, example: 'Teacher@123' }
 *               gender: { type: string, enum: [MALE, FEMALE, OTHER], example: MALE }
 *               phone: { type: string, maxLength: 20, example: '01700000000' }
 *               designation: { type: string, maxLength: 100, example: 'Senior Teacher' }
 *               qualification: { type: string, example: 'M.Sc in Mathematics' }
 *               joining_date: { type: string, format: date, example: '2020-01-15' }
 *     responses:
 *       201:
 *         description: Teacher created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Teacher' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.post('/', rbacMiddleware('TEACHER_CREATE'), teacherController.create);

/**
 * @openapi
 * /teachers/{id}:
 *   patch:
 *     tags: [Teachers]
 *     summary: Update a teacher profile
 *     description: |
 *       Updates the mutable fields of the teacher profile (not the user account).
 *       Requires the `TEACHER_UPDATE` permission.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone: { type: string, maxLength: 20, example: '01700000000' }
 *               designation: { type: string, maxLength: 100, example: 'Senior Teacher' }
 *               qualification: { type: string, example: 'M.Sc in Mathematics' }
 *               joining_date: { type: string, format: date, example: '2020-01-15' }
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
 *                     data: { $ref: '#/components/schemas/Teacher' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:id', rbacMiddleware('TEACHER_UPDATE'), teacherController.update);

/**
 * @openapi
 * /teachers/{id}:
 *   delete:
 *     tags: [Teachers]
 *     summary: Delete a teacher (soft delete)
 *     description: |
 *       Soft-deletes the teacher. Cannot be deleted if active subject assignments exist (400).
 *       Requires the `TEACHER_DELETE` permission.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Teacher deleted
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       400:
 *         description: Could not delete because active assignments exist
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
router.delete('/:id', rbacMiddleware('TEACHER_DELETE'), teacherController.delete);

export default router;
