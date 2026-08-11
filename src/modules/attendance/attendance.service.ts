import { attendanceRepository, type StudentAttendanceDetailRow } from './attendance.repository.js';
import {
  attendanceEngine,
  type AttendanceBreakdown,
  type StaffMonthlyWorkHours,
  type StudentMonthlyAttendance,
} from '../../core/attendance.engine.js';
import { studentRepository } from '../students/student.repository.js';
import { classRepository } from '../classes/class.repository.js';
import { sectionRepository } from '../sections/section.repository.js';
import { userRepository } from '../users/user.repository.js';
import { AppError } from '../../utils/appError.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import {
  assertUuid,
  assertEnum,
  assertDate,
  assertInteger,
  assertArray,
  assertNumber,
  ATTENDANCE_STATUSES,
} from '../../utils/validators.js';
import type { ListQuery, Paginated } from '../../types/common.types.js';
import type { AttendanceLogRow, StudentAttendanceRow } from '../../types/db.types.js';

export interface MarkStudentsInput {
  class_id: string;
  section_id?: string | null;
  attendance_date: string;
  /** raw entries — each one is validated below, so the element type stays unchecked */
  records: unknown[];
}

export interface MarkStudentsResult {
  marked: number;
  records: StudentAttendanceRow[];
}

export interface StaffCheckInInput {
  userId: string;
  attendance_date: string;
  ip_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface StaffCheckOutInput {
  userId: string;
  attendance_date: string;
  latitude?: number | null;
  longitude?: number | null;
}

export const attendanceService = {
  // ── Student: mark a single day's attendance (bulk) ──
  // body = { class_id, section_id, attendance_date, records: [{ student_id, status }] }
  async markStudents({
    class_id,
    section_id,
    attendance_date,
    records,
  }: MarkStudentsInput): Promise<MarkStudentsResult> {
    class_id = assertUuid(class_id, 'class_id');
    section_id = assertUuid(section_id, 'section_id', { required: false });
    attendance_date = assertDate(attendance_date, 'attendance_date');
    // the element type is an assertion, not a check — each field is validated individually below
    const entries = assertArray<{ student_id?: unknown; status?: unknown }>(records, 'records', {
      min: 1,
    });

    const cls = await classRepository.findById(class_id);
    if (!cls) throw new AppError('Class not found', 404);

    if (section_id) {
      const section = await sectionRepository.findById(section_id);
      if (!section) throw new AppError('Section not found', 404);
    }

    // validate + normalize each record (an invalid status/student_id is caught here)
    const normalized = entries.map((r, i) => ({
      student_id: assertUuid(r.student_id, `records[${i}].student_id`),
      status: assertEnum(r.status, `records[${i}].status`, ATTENDANCE_STATUSES),
    }));

    // the same student appearing more than once is a duplicate — deterministic error
    const seen = new Set<string>();
    for (const r of normalized) {
      if (seen.has(r.student_id)) {
        throw new AppError(`Duplicate student_id in records: ${r.student_id}`, 400);
      }
      seen.add(r.student_id);
    }

    const saved = await attendanceRepository.bulkMarkStudents({
      classId: class_id,
      sectionId: section_id || null,
      attendanceDate: attendance_date,
      records: normalized,
    });

    return { marked: saved.length, records: saved };
  },

  async listStudentAttendance(
    queryOptions: ListQuery,
  ): Promise<Paginated<StudentAttendanceDetailRow>> {
    const { page, limit, offset } = getPagination(queryOptions);
    const [data, total] = await Promise.all([
      attendanceRepository.listStudentAttendance(queryOptions, { limit, offset }),
      attendanceRepository.countStudentAttendance(queryOptions),
    ]);
    return { data, meta: buildMeta({ total, page, limit }) };
  },

  // ── Student: monthly attendance % (core engine) — report card / guardian portal ──
  //
  // year/month are `unknown`: they arrive straight off req.query, where every value is
  // untyped text (or an array, for a repeated parameter). assertInteger is what turns
  // them into numbers, so the normalised values are bound to new names rather than
  // written back over the parameters.
  async getStudentMonthly(
    studentId: string,
    year: unknown,
    month: unknown,
  ): Promise<StudentMonthlyAttendance> {
    const id = assertUuid(studentId, 'studentId');
    const yr = assertInteger(year, 'year', { min: 2000, max: 2100 });
    const mo = assertInteger(month, 'month', { min: 1, max: 12 });

    const student = await studentRepository.findById(id);
    if (!student) throw new AppError('Student not found', 404);

    return attendanceEngine.calculateStudentMonthlyAttendance(id, yr, mo);
  },

  // ── Class: single-day attendance summary (core engine) — teacher dashboard ──
  async getDailyClassSummary(
    classId: string,
    sectionId: string,
    date: unknown,
  ): Promise<AttendanceBreakdown> {
    const cls = assertUuid(classId, 'classId');
    const sec = assertUuid(sectionId, 'sectionId');
    const day = assertDate(date, 'date');

    return attendanceEngine.calculateDailyClassSummary(cls, sec, day);
  },

  // ── Staff: check-in ──
  async staffCheckIn({
    userId,
    attendance_date,
    ip_address,
    latitude,
    longitude,
  }: StaffCheckInInput): Promise<AttendanceLogRow> {
    userId = assertUuid(userId, 'userId');
    attendance_date = assertDate(attendance_date, 'attendance_date');
    latitude = assertNumber(latitude, 'latitude', { required: false });
    longitude = assertNumber(longitude, 'longitude', { required: false });

    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    // prevent a second check-in on the same day
    const existing = await attendanceRepository.findStaffLog(userId, attendance_date);
    if (existing) {
      throw new AppError('Already checked in for this date', 409);
    }

    return attendanceRepository.createCheckIn({
      userId,
      attendanceDate: attendance_date,
      ipAddress: ip_address,
      latitude,
      longitude,
    });
  },

  // ── Staff: check-out ──
  async staffCheckOut({
    userId,
    attendance_date,
    latitude,
    longitude,
  }: StaffCheckOutInput): Promise<AttendanceLogRow> {
    userId = assertUuid(userId, 'userId');
    attendance_date = assertDate(attendance_date, 'attendance_date');
    latitude = assertNumber(latitude, 'latitude', { required: false });
    longitude = assertNumber(longitude, 'longitude', { required: false });

    const log = await attendanceRepository.findStaffLog(userId, attendance_date);
    if (!log) throw new AppError('No check-in found for this date', 404);
    if (log.check_out) throw new AppError('Already checked out for this date', 409);

    return attendanceRepository.setCheckOut({ logId: log.id, latitude, longitude });
  },

  // ── Staff: monthly work hours (core engine) — HR / payroll ──
  async getStaffMonthly(
    userId: string,
    year: unknown,
    month: unknown,
  ): Promise<StaffMonthlyWorkHours> {
    const id = assertUuid(userId, 'userId');
    const yr = assertInteger(year, 'year', { min: 2000, max: 2100 });
    const mo = assertInteger(month, 'month', { min: 1, max: 12 });

    const user = await userRepository.findById(id);
    if (!user) throw new AppError('User not found', 404);

    return attendanceEngine.calculateStaffMonthlyWorkHours(id, yr, mo);
  },
};
