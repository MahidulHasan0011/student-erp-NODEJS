import { attendanceService } from './attendance.service.js';
import { requireUser } from '../../middlewares/auth.middleware.js';
import { successResponse } from '../../utils/response.js';
import type { Handler } from '../../types/http.types.js';

type AttendanceController = Record<
  | 'markStudents'
  | 'listStudents'
  | 'studentMonthly'
  | 'dailyClassSummary'
  | 'staffCheckIn'
  | 'staffCheckOut'
  | 'staffMonthly',
  Handler
>;

export const attendanceController: AttendanceController = {
  // POST /attendance/students  { class_id, section_id?, attendance_date, records: [{student_id, status}] }
  async markStudents(req, res, next) {
    try {
      const data = await attendanceService.markStudents(req.body);
      return successResponse(res, { message: 'Attendance marked', data, statusCode: 201 });
    } catch (err) {
      next(err);
    }
  },

  // GET /attendance/students?class_id&section_id&attendance_date&status&page&limit
  async listStudents(req, res, next) {
    try {
      const { data, meta } = await attendanceService.listStudentAttendance(req.query);
      return successResponse(res, { message: 'Attendance fetched', data, meta });
    } catch (err) {
      next(err);
    }
  },

  // GET /attendance/students/:studentId/monthly?year&month
  async studentMonthly(req, res, next) {
    try {
      const { studentId } = req.params;
      const { year, month } = req.query;
      const data = await attendanceService.getStudentMonthly(studentId, year, month);
      return successResponse(res, { message: 'Monthly attendance fetched', data });
    } catch (err) {
      next(err);
    }
  },

  // GET /attendance/class/:classId/:sectionId/daily?date
  async dailyClassSummary(req, res, next) {
    try {
      const { classId, sectionId } = req.params;
      const data = await attendanceService.getDailyClassSummary(classId, sectionId, req.query.date);
      return successResponse(res, { message: 'Daily class summary fetched', data });
    } catch (err) {
      next(err);
    }
  },

  // POST /attendance/staff/check-in  { userId?, attendance_date, latitude?, longitude? }
  async staffCheckIn(req, res, next) {
    try {
      const data = await attendanceService.staffCheckIn({
        // if userId is not provided, check in the logged-in user
        userId: req.body.userId || requireUser(req).userId,
        ...req.body,
        ip_address: req.ip,
      });
      return successResponse(res, { message: 'Checked in', data, statusCode: 201 });
    } catch (err) {
      next(err);
    }
  },

  // POST /attendance/staff/check-out  { userId?, attendance_date, latitude?, longitude? }
  async staffCheckOut(req, res, next) {
    try {
      const data = await attendanceService.staffCheckOut({
        userId: req.body.userId || requireUser(req).userId,
        ...req.body,
      });
      return successResponse(res, { message: 'Checked out', data });
    } catch (err) {
      next(err);
    }
  },

  // GET /attendance/staff/:userId/monthly?year&month
  async staffMonthly(req, res, next) {
    try {
      const { userId } = req.params;
      const { year, month } = req.query;
      const data = await attendanceService.getStaffMonthly(userId, year, month);
      return successResponse(res, { message: 'Monthly work hours fetched', data });
    } catch (err) {
      next(err);
    }
  },
};
