import { Router } from 'express';
import { subjectAssignmentController } from './subject-assignment.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rbacMiddleware } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /assignments:
 *   get:
 *     tags: [Subject-Assignments]
 *     summary: List teacher-subject assignments (paginated)
 *     description: 'Requires the `SUBJECT_ASSIGNMENT_READ` permission. Can be filtered by `teacher_id`, `class_id`, `section_id`, `subject_id`, `academic_session_id`.'
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - { name: teacher_id, in: query, required: false, schema: { type: string, format: uuid } }
 *       - { name: class_id, in: query, required: false, schema: { type: string, format: uuid } }
 *       - { name: section_id, in: query, required: false, schema: { type: string, format: uuid } }
 *       - { name: subject_id, in: query, required: false, schema: { type: string, format: uuid } }
 *       - { name: academic_session_id, in: query, required: false, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: List of assignments (with teacher/class/section/subject/session names)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { type: array, items: { $ref: '#/components/schemas/SubjectAssignment' } }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', rbacMiddleware('SUBJECT_ASSIGNMENT_READ'), subjectAssignmentController.getAll);
/**
 * @openapi
 * /assignments/{id}:
 *   get:
 *     tags: [Subject-Assignments]
 *     summary: Get a single assignment
 *     description: 'Requires the `SUBJECT_ASSIGNMENT_READ` permission.'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Assignment details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/SubjectAssignment' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', rbacMiddleware('SUBJECT_ASSIGNMENT_READ'), subjectAssignmentController.getById);
/**
 * @openapi
 * /assignments/teacher/{teacherId}:
 *   get:
 *     tags: [Subject-Assignments]
 *     summary: All assignments for a specific teacher
 *     description: 'Requires the `SUBJECT_ASSIGNMENT_READ` permission. Returns 404 if the teacher does not exist.'
 *     parameters:
 *       - name: teacherId
 *         in: path
 *         required: true
 *         description: Teacher UUID
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: List of the teacher's assignments
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { type: array, items: { $ref: '#/components/schemas/SubjectAssignment' } }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/teacher/:teacherId',
  rbacMiddleware('SUBJECT_ASSIGNMENT_READ'),
  subjectAssignmentController.getByTeacher,
);
/**
 * @openapi
 * /assignments:
 *   post:
 *     tags: [Subject-Assignments]
 *     summary: Assign a teacher to a subject/class/session
 *     description: >
 *       Requires the `SUBJECT_ASSIGNMENT_CREATE` permission. `assigned_by` is set automatically from the logged-in admin.
 *       `section_id` is required if the class has sections; it must not be provided if the class has no sections.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [teacher_id, class_id, subject_id, academic_session_id]
 *             properties:
 *               teacher_id: { type: string, format: uuid }
 *               class_id: { type: string, format: uuid }
 *               subject_id: { type: string, format: uuid }
 *               academic_session_id: { type: string, format: uuid }
 *               section_id: { type: string, format: uuid, description: 'required if the class has sections' }
 *     responses:
 *       201:
 *         description: Assignment created (with `other_teachers_on_same_slot` count)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/SubjectAssignment' }
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
router.post('/', rbacMiddleware('SUBJECT_ASSIGNMENT_CREATE'), subjectAssignmentController.create);
/**
 * @openapi
 * /assignments/{id}:
 *   patch:
 *     tags: [Subject-Assignments]
 *     summary: Update an assignment (mainly to reassign the teacher)
 *     description: 'Requires the `SUBJECT_ASSIGNMENT_UPDATE` permission. All fields are optional — only the fields sent are changed.'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               teacher_id: { type: string, format: uuid }
 *               class_id: { type: string, format: uuid }
 *               section_id: { type: string, format: uuid, nullable: true }
 *               subject_id: { type: string, format: uuid }
 *               academic_session_id: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Assignment updated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/SubjectAssignment' }
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
router.patch(
  '/:id',
  rbacMiddleware('SUBJECT_ASSIGNMENT_UPDATE'),
  subjectAssignmentController.update,
);
/**
 * @openapi
 * /assignments/{id}:
 *   delete:
 *     tags: [Subject-Assignments]
 *     summary: Delete an assignment (soft delete)
 *     description: 'Requires the `SUBJECT_ASSIGNMENT_DELETE` permission.'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Assignment deleted
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
router.delete(
  '/:id',
  rbacMiddleware('SUBJECT_ASSIGNMENT_DELETE'),
  subjectAssignmentController.delete,
);

export default router;
