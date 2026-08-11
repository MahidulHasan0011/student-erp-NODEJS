import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../config/db.js';
import { buildWhereClause, type FilterConfig } from '../../utils/queryBuilder.js';
import { buildOrder } from '../../utils/order.js';
import type { ListQuery, Pagination } from '../../types/common.types.js';
import type {
  AttendanceLogRow,
  AttendanceStatus,
  StudentAttendanceRow,
} from '../../types/db.types.js';

// ── DB write/read layer — attendance.engine only computes (read-only),
//    the actual mark/check-in/check-out happens here ──

/** listStudentAttendance also selects the student's name and code. */
export interface StudentAttendanceDetailRow extends StudentAttendanceRow {
  student_name: string;
  student_code: string;
}

/** One entry of a bulk mark — already validated by the service. */
export interface AttendanceMarkRecord {
  student_id: string;
  status: AttendanceStatus;
}

export interface BulkMarkParams {
  classId: string;
  sectionId: string | null;
  attendanceDate: string;
  records: AttendanceMarkRecord[];
}

export interface CheckInParams {
  userId: string;
  attendanceDate: string;
  ipAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface CheckOutParams {
  logId: string;
  latitude?: number | null;
  longitude?: number | null;
}

const SA_SORTABLE: Record<string, string> = {
  attendance_date: 'sa.attendance_date',
  created_at: 'sa.created_at',
};

const SA_FILTER: FilterConfig = {
  searchableColumns: [],
  filterableColumns: [
    { param: 'student_id', column: 'sa.student_id' },
    { param: 'class_id', column: 'sa.class_id' },
    { param: 'section_id', column: 'sa.section_id' },
    { param: 'attendance_date', column: 'sa.attendance_date' },
    { param: 'status', column: 'sa.status' },
  ],
};

export const attendanceRepository = {
  // ── Student attendance ──

  // whether a record already exists for a student on a given date — to prevent duplicates
  //
  // The client branch used to be `client.query.bind(client)`; binding an overloaded method
  // erases its generic, so the row type could not be threaded through. Same decision, made
  // at the call site instead.
  async findStudentRecord(
    client: PoolClient | null,
    studentId: string,
    attendanceDate: string,
  ): Promise<StudentAttendanceRow | null> {
    const sql = `SELECT * FROM student_attendance
       WHERE student_id = $1 AND attendance_date = $2 AND deleted_at IS NULL
       LIMIT 1`;
    const params = [studentId, attendanceDate];
    const { rows } = client
      ? await client.query<StudentAttendanceRow>(sql, params)
      : await query<StudentAttendanceRow>(sql, params);
    return rows[0] || null;
  },

  // mark a class/section's single-day attendance in one go — upsert (update if exists, otherwise insert)
  // the whole thing runs in a single transaction → a partial failure rolls everything back (data consistency)
  async bulkMarkStudents({
    classId,
    sectionId,
    attendanceDate,
    records,
  }: BulkMarkParams): Promise<StudentAttendanceRow[]> {
    return withTransaction(async (client) => {
      const results: StudentAttendanceRow[] = [];
      for (const { student_id, status } of records) {
        const existing = await this.findStudentRecord(client, student_id, attendanceDate);

        if (existing) {
          const { rows } = await client.query<StudentAttendanceRow>(
            `UPDATE student_attendance
             SET status = $1, class_id = $2, section_id = $3, updated_at = NOW()
             WHERE id = $4
             RETURNING *`,
            [status, classId, sectionId, existing.id],
          );
          results.push(rows[0]);
        } else {
          const { rows } = await client.query<StudentAttendanceRow>(
            `INSERT INTO student_attendance (student_id, class_id, section_id, attendance_date, status)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [student_id, classId, sectionId, attendanceDate, status],
          );
          results.push(rows[0]);
        }
      }
      return results;
    });
  },

  async listStudentAttendance(
    queryOptions: ListQuery,
    { limit, offset }: Pick<Pagination, 'limit' | 'offset'>,
  ): Promise<StudentAttendanceDetailRow[]> {
    const values: unknown[] = [];
    const countRef = { value: 1 };
    const where = buildWhereClause(queryOptions, values, SA_FILTER, countRef, 'sa');
    const { sortBy, sortOrder } = buildOrder(queryOptions, SA_SORTABLE, 'attendance_date');

    values.push(limit, offset);
    const limitIdx = countRef.value;
    const offsetIdx = countRef.value + 1;

    const { rows } = await query<StudentAttendanceDetailRow>(
      `SELECT sa.*, u.full_name AS student_name, s.student_code
       FROM student_attendance sa
       JOIN students s ON s.id = sa.student_id
       JOIN users u ON u.id = s.user_id
       ${where}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      values,
    );
    return rows;
  },

  async countStudentAttendance(queryOptions: ListQuery): Promise<number> {
    const values: unknown[] = [];
    const countRef = { value: 1 };
    const where = buildWhereClause(queryOptions, values, SA_FILTER, countRef, 'sa');
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM student_attendance sa ${where}`,
      values,
    );
    return parseInt(rows[0].count);
  },

  // ── Staff attendance (attendance_logs) ──

  // today's (or a specific date's) log — used for check-in/out
  async findStaffLog(userId: string, attendanceDate: string): Promise<AttendanceLogRow | null> {
    const { rows } = await query<AttendanceLogRow>(
      `SELECT * FROM attendance_logs
       WHERE user_id = $1 AND attendance_date = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [userId, attendanceDate],
    );
    return rows[0] || null;
  },

  async createCheckIn({
    userId,
    attendanceDate,
    ipAddress,
    latitude,
    longitude,
  }: CheckInParams): Promise<AttendanceLogRow> {
    const { rows } = await query<AttendanceLogRow>(
      `INSERT INTO attendance_logs
         (user_id, attendance_date, check_in, status, ip_address, check_in_latitude, check_in_longitude)
       VALUES ($1, $2, NOW(), 'PRESENT', $3, $4, $5)
       RETURNING *`,
      [userId, attendanceDate, ipAddress ?? null, latitude ?? null, longitude ?? null],
    );
    return rows[0];
  },

  // check-out — computes and stores the elapsed time in minutes from check_in until now
  async setCheckOut({ logId, latitude, longitude }: CheckOutParams): Promise<AttendanceLogRow> {
    const { rows } = await query<AttendanceLogRow>(
      `UPDATE attendance_logs
       SET check_out = NOW(),
           total_work_minutes = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (NOW() - check_in)) / 60)),
           check_out_latitude = COALESCE($2, check_out_latitude),
           check_out_longitude = COALESCE($3, check_out_longitude),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [logId, latitude ?? null, longitude ?? null],
    );
    return rows[0];
  },
};
