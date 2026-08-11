import { Router } from 'express';
import { attendanceController } from './attendance.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rbacMiddleware } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authMiddleware);

// ── Student attendance ──

/**
 * @openapi
 * /attendance/students:
 *   post:
 *     tags: [Attendance]
 *     summary: Mark a single day's attendance for a class/section (bulk upsert)
 *     description: >-
 *       Requires `ATTENDANCE_MARK` permission. If a record for the same student+date already exists it is updated, otherwise a new one is inserted.
 *       The whole operation runs in a single transaction — if any record is invalid, everything is rolled back.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [class_id, attendance_date, records]
 *             properties:
 *               class_id: { type: string, format: uuid }
 *               section_id: { type: string, format: uuid, description: 'optional' }
 *               attendance_date: { type: string, format: date, example: '2026-07-05' }
 *               records:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [student_id, status]
 *                   properties:
 *                     student_id: { type: string, format: uuid }
 *                     status: { type: string, enum: [PRESENT, ABSENT, LATE, EXCUSED] }
 *     responses:
 *       201: { description: marked successfully }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/students', rbacMiddleware('ATTENDANCE_MARK'), attendanceController.markStudents);

/**
 * @openapi
 * /attendance/students:
 *   get:
 *     tags: [Attendance]
 *     summary: List student attendance records (pagination + filter)
 *     description: >-
 *       Requires `ATTENDANCE_READ` permission. Can be filtered by student_id / class_id / section_id / attendance_date / status.
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - { name: student_id, in: query, required: false, schema: { type: string, format: uuid } }
 *       - { name: class_id, in: query, required: false, schema: { type: string, format: uuid } }
 *       - { name: section_id, in: query, required: false, schema: { type: string, format: uuid } }
 *       - { name: attendance_date, in: query, required: false, schema: { type: string, format: date } }
 *       - { name: status, in: query, required: false, schema: { type: string, enum: [PRESENT, ABSENT, LATE, EXCUSED] } }
 *     responses:
 *       200: { description: list }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/students', rbacMiddleware('ATTENDANCE_READ'), attendanceController.listStudents);

/**
 * @openapi
 * /attendance/students/{studentId}/monthly:
 *   get:
 *     tags: [Attendance]
 *     summary: A single student's monthly attendance % (report card)
 *     description: 'Requires `ATTENDANCE_READ` permission. LATE is also counted as present.'
 *     parameters:
 *       - { name: studentId, in: path, required: true, schema: { type: string, format: uuid } }
 *       - { name: year, in: query, required: true, schema: { type: integer, example: 2026 } }
 *       - { name: month, in: query, required: true, schema: { type: integer, minimum: 1, maximum: 12, example: 7 } }
 *     responses:
 *       200: { description: monthly summary + attendance_percentage }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/students/:studentId/monthly',
  rbacMiddleware('ATTENDANCE_READ'),
  attendanceController.studentMonthly,
);

/**
 * @openapi
 * /attendance/class/{classId}/{sectionId}/daily:
 *   get:
 *     tags: [Attendance]
 *     summary: A class/section's single-day attendance summary (teacher dashboard)
 *     description: 'Requires `ATTENDANCE_READ` permission. Returns PRESENT/ABSENT/LATE/EXCUSED counts.'
 *     parameters:
 *       - { name: classId, in: path, required: true, schema: { type: string, format: uuid } }
 *       - { name: sectionId, in: path, required: true, schema: { type: string, format: uuid } }
 *       - { name: date, in: query, required: true, schema: { type: string, format: date, example: '2026-07-05' } }
 *     responses:
 *       200: { description: summary }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/class/:classId/:sectionId/daily',
  rbacMiddleware('ATTENDANCE_READ'),
  attendanceController.dailyClassSummary,
);

// ── Staff attendance ──

/**
 * @openapi
 * /attendance/staff/check-in:
 *   post:
 *     tags: [Attendance]
 *     summary: staff check-in
 *     description: >-
 *       Requires `ATTENDANCE_MARK` permission. If userId is not provided, the logged-in user is checked in.
 *       Checking in twice on the same day returns 409.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [attendance_date]
 *             properties:
 *               userId: { type: string, format: uuid, description: 'optional — defaults to self' }
 *               attendance_date: { type: string, format: date }
 *               latitude: { type: number }
 *               longitude: { type: number }
 *     responses:
 *       201: { description: checked in }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/staff/check-in',
  rbacMiddleware('ATTENDANCE_MARK'),
  attendanceController.staffCheckIn,
);

/**
 * @openapi
 * /attendance/staff/check-out:
 *   post:
 *     tags: [Attendance]
 *     summary: staff check-out (work minutes calculated automatically)
 *     description: >-
 *       Requires `ATTENDANCE_MARK` permission. Returns 404 if there is no check-in, or 409 if already checked out.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [attendance_date]
 *             properties:
 *               userId: { type: string, format: uuid, description: 'optional — defaults to self' }
 *               attendance_date: { type: string, format: date }
 *               latitude: { type: number }
 *               longitude: { type: number }
 *     responses:
 *       200: { description: checked out }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/staff/check-out',
  rbacMiddleware('ATTENDANCE_MARK'),
  attendanceController.staffCheckOut,
);

/**
 * @openapi
 * /attendance/staff/{userId}/monthly:
 *   get:
 *     tags: [Attendance]
 *     summary: A single staff member's monthly work hours (HR / payroll)
 *     description: 'Requires `ATTENDANCE_READ` permission. Returns days_present, total_work_minutes, total_work_hours.'
 *     parameters:
 *       - { name: userId, in: path, required: true, schema: { type: string, format: uuid } }
 *       - { name: year, in: query, required: true, schema: { type: integer, example: 2026 } }
 *       - { name: month, in: query, required: true, schema: { type: integer, minimum: 1, maximum: 12, example: 7 } }
 *     responses:
 *       200: { description: monthly work hours }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/staff/:userId/monthly',
  rbacMiddleware('ATTENDANCE_READ'),
  attendanceController.staffMonthly,
);

export default router;
