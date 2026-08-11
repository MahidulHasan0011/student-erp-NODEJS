import { Router } from 'express';
import { examResultController } from './exam-result.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rbacMiddleware } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /results:
 *   get:
 *     tags: [Exam-Results]
 *     summary: List exam results (paginated, with filter)
 *     description: >-
 *       Requires `EXAM_RESULT_READ` permission. Filter by `exam_id`, `student_id`, `subject_id`,
 *       and sort with `sortBy`/`sortOrder`. Each result includes the exam, student and subject names.
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - { name: exam_id, in: query, required: false, schema: { type: string, format: uuid } }
 *       - { name: student_id, in: query, required: false, schema: { type: string, format: uuid } }
 *       - { name: subject_id, in: query, required: false, schema: { type: string, format: uuid } }
 *       - { name: sortBy, in: query, required: false, schema: { type: string, enum: [marks, created_at] } }
 *       - { name: sortOrder, in: query, required: false, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200:
 *         description: List of results
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { type: array, items: { $ref: '#/components/schemas/ExamResult' } }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', rbacMiddleware('EXAM_RESULT_READ'), examResultController.getAll);

/**
 * @openapi
 * /results/{id}:
 *   get:
 *     tags: [Exam-Results]
 *     summary: Get a single exam result's details
 *     description: 'Requires `EXAM_RESULT_READ` permission. Returns a single result with exam, student and subject names.'
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Result details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/ExamResult' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', rbacMiddleware('EXAM_RESULT_READ'), examResultController.getById);

/**
 * @openapi
 * /results/exam/{examId}:
 *   get:
 *     tags: [Exam-Results]
 *     summary: All results for an exam
 *     description: >-
 *       Requires `EXAM_RESULT_READ` permission. Returns all subject-wise results for a given exam
 *       (with student and subject names). Returns 404 if the exam is not found.
 *     parameters:
 *       - { name: examId, in: path, required: true, description: 'Exam UUID', schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Exam results
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { type: array, items: { $ref: '#/components/schemas/ExamResult' } }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/exam/:examId', rbacMiddleware('EXAM_RESULT_READ'), examResultController.getByExam);

/**
 * @openapi
 * /results/exam/{examId}/student/{studentId}/marksheet:
 *   get:
 *     tags: [Exam-Results]
 *     summary: A student's marksheet for an exam
 *     description: >-
 *       Requires `EXAM_RESULT_READ` permission. Returns marks/grade for all subjects for a given exam and student,
 *       along with the total marks (total_marks). Returns 404 if the exam or student is not found.
 *     parameters:
 *       - { name: examId, in: path, required: true, description: 'Exam UUID', schema: { type: string, format: uuid } }
 *       - { name: studentId, in: path, required: true, description: 'Student UUID', schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Marksheet
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
 *                         exam: { $ref: '#/components/schemas/Exam' }
 *                         student: { $ref: '#/components/schemas/Student' }
 *                         results: { type: array, items: { $ref: '#/components/schemas/ExamResult' } }
 *                         total_marks: { type: number }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/exam/:examId/student/:studentId/marksheet',
  rbacMiddleware('EXAM_RESULT_READ'),
  examResultController.getMarksheet,
);

/**
 * @openapi
 * /results:
 *   post:
 *     tags: [Exam-Results]
 *     summary: Enter a single result (one student, one subject)
 *     description: >-
 *       Requires `EXAM_RESULT_CREATE` permission. `marks` must be between 0–100; the grade is determined automatically.
 *       Entry is blocked if the exam is PUBLISHED (unpublish it first) — 400.
 *       Returns 409 if an entry already exists for the same exam/student/subject.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [exam_id, student_id, subject_id, marks]
 *             properties:
 *               exam_id: { type: string, format: uuid }
 *               student_id: { type: string, format: uuid }
 *               subject_id: { type: string, format: uuid }
 *               marks: { type: number, minimum: 0, maximum: 100, example: 87.5 }
 *     responses:
 *       201:
 *         description: Result entered
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/ExamResult' }
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
router.post('/', rbacMiddleware('EXAM_RESULT_CREATE'), examResultController.create);

/**
 * @openapi
 * /results/bulk:
 *   post:
 *     tags: [Exam-Results]
 *     summary: Enter many results at once (bulk upsert)
 *     description: >-
 *       Requires `EXAM_RESULT_CREATE` permission. Marks for many students/subjects are set at once for a single exam —
 *       if (exam, student, subject) already exists, marks/grade are updated (upsert). Returns 400 if the exam is PUBLISHED.
 *       The response returns the inserted results and completion info (whether entry is complete for all students).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [examId, entries]
 *             properties:
 *               examId: { type: string, format: uuid }
 *               entries:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [student_id, subject_id, marks]
 *                   properties:
 *                     student_id: { type: string, format: uuid }
 *                     subject_id: { type: string, format: uuid }
 *                     marks: { type: number, minimum: 0, maximum: 100 }
 *     responses:
 *       201:
 *         description: Bulk results entered
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
 *                         results: { type: array, items: { $ref: '#/components/schemas/ExamResult' } }
 *                         completion:
 *                           type: object
 *                           properties:
 *                             examId: { type: string, format: uuid }
 *                             examType: { type: string }
 *                             isComplete: { type: boolean }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/bulk', rbacMiddleware('EXAM_RESULT_CREATE'), examResultController.bulkCreate);

/**
 * @openapi
 * /results/{id}:
 *   patch:
 *     tags: [Exam-Results]
 *     summary: Update a result's marks
 *     description: >-
 *       Requires `EXAM_RESULT_UPDATE` permission. Only `marks` can be updated (0–100); the grade is recalculated.
 *       Returns 400 if the exam is PUBLISHED.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [marks]
 *             properties:
 *               marks: { type: number, minimum: 0, maximum: 100 }
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
 *                     data: { $ref: '#/components/schemas/ExamResult' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:id', rbacMiddleware('EXAM_RESULT_UPDATE'), examResultController.update);

/**
 * @openapi
 * /results/{id}:
 *   delete:
 *     tags: [Exam-Results]
 *     summary: Delete a result (soft delete)
 *     description: 'Requires `EXAM_RESULT_UPDATE` permission. Cannot delete if the exam is PUBLISHED — 400.'
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
router.delete('/:id', rbacMiddleware('EXAM_RESULT_UPDATE'), examResultController.delete);

export default router;
