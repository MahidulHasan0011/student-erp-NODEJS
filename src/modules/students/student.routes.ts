import { Router } from 'express';
import { studentController } from './student.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rbacMiddleware } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /students:
 *   get:
 *     tags: [Students]
 *     summary: List all students (pagination + search)
 *     description: |
 *       Returns a paginated list of students. Requires the `STUDENT_READ` permission.
 *       `search` matches against full_name, email, student_code, and guardian_name.
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - name: search
 *         in: query
 *         required: false
 *         description: keyword search across full_name / email / student_code / guardian_name
 *         schema: { type: string }
 *       - name: sortBy
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [full_name, student_code, created_at], default: created_at }
 *       - name: sortOrder
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [asc, desc] }
 *     responses:
 *       200:
 *         description: List of students
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Student' }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', rbacMiddleware('STUDENT_READ'), studentController.getAll);

/**
 * @openapi
 * /students/{id}:
 *   get:
 *     tags: [Students]
 *     summary: Get a single student by ID
 *     description: Returns the profile of the specified student. Requires the `STUDENT_READ` permission.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Student details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Student' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', rbacMiddleware('STUDENT_READ'), studentController.getById);

/**
 * @openapi
 * /students/{id}/enrollment:
 *   get:
 *     tags: [Students]
 *     summary: Student profile + current session enrollment
 *     description: |
 *       Returns the student's profile along with the current enrollment
 *       (class, section, roll_number) for the active academic session. Requires the `STUDENT_READ` permission.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Student details including current_enrollment
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       allOf:
 *                         - $ref: '#/components/schemas/Student'
 *                         - type: object
 *                           properties:
 *                             current_enrollment:
 *                               type: object
 *                               nullable: true
 *                               properties:
 *                                 enrollment_id: { type: string, format: uuid }
 *                                 roll_number: { type: integer }
 *                                 class_id: { type: string, format: uuid }
 *                                 class_name: { type: string }
 *                                 section_id: { type: string, format: uuid, nullable: true }
 *                                 section_name: { type: string, nullable: true }
 *                                 academic_session_id: { type: string, format: uuid }
 *                                 session_name: { type: string }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id/enrollment', rbacMiddleware('STUDENT_READ'), studentController.getWithEnrollment);

/**
 * @openapi
 * /students:
 *   post:
 *     tags: [Students]
 *     summary: Create a new student (user account + profile)
 *     description: |
 *       Creates a user account and student profile together; student_code (STU-YYYY-NNN)
 *       is generated automatically. Requires the `STUDENT_CREATE` permission.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, email, password]
 *             properties:
 *               full_name: { type: string, maxLength: 100, example: Rahim Uddin }
 *               email: { type: string, format: email, maxLength: 100, example: rahim@school.com }
 *               password: { type: string, format: password, minLength: 6, example: 'Student@123' }
 *               gender: { type: string, enum: [MALE, FEMALE, OTHER], example: MALE }
 *               date_of_birth: { type: string, format: date, example: '2010-05-12' }
 *               guardian_name: { type: string, maxLength: 100, example: Karim Uddin }
 *               guardian_phone: { type: string, maxLength: 20, example: '01700000000' }
 *               address: { type: string, example: 'Dhaka, Bangladesh' }
 *     responses:
 *       201:
 *         description: Student created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Student' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.post('/', rbacMiddleware('STUDENT_CREATE'), studentController.create);

/**
 * @openapi
 * /students/{id}:
 *   patch:
 *     tags: [Students]
 *     summary: Update a student profile
 *     description: |
 *       Updates the mutable fields of the student profile (not the user account).
 *       Requires the `STUDENT_UPDATE` permission.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date_of_birth: { type: string, format: date, example: '2010-05-12' }
 *               guardian_name: { type: string, maxLength: 100, example: Karim Uddin }
 *               guardian_phone: { type: string, maxLength: 20, example: '01700000000' }
 *               address: { type: string, example: 'Dhaka, Bangladesh' }
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
 *                     data: { $ref: '#/components/schemas/Student' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:id', rbacMiddleware('STUDENT_UPDATE'), studentController.update);

/**
 * @openapi
 * /students/{id}:
 *   delete:
 *     tags: [Students]
 *     summary: Delete a student (soft delete)
 *     description: |
 *       Soft-deletes the student. Cannot be deleted if enrollment records exist (400).
 *       Requires the `STUDENT_DELETE` permission.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Student deleted
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       400:
 *         description: Could not delete because enrollment records exist
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
router.delete('/:id', rbacMiddleware('STUDENT_DELETE'), studentController.delete);

export default router;
