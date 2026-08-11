// ─────────────────────────────────────────────────────────────────────────────
// Database row types — one interface per table, mirroring database/schema.sql
// and database/migrations/*.sql exactly.
//
// These describe what `pg` HANDS BACK from a `SELECT *`. They are not API shapes
// and not input DTOs — a repository returning a JOIN or a subset of columns should
// declare its own projection type next to the query (phase 4).
//
// ── How Postgres types arrive in JS (node-pg defaults; we register no custom
//    type parsers anywhere — verified: no setTypeParser call in the codebase) ──
//
//   uuid, varchar, text     → string
//   integer                 → number
//   boolean                 → boolean
//   date, timestamp         → Date        (yes, `date` too — pg builds a Date)
//   jsonb                   → parsed value (object/array/primitive)
//   numeric                 → string  ⚠  NOT number — pg keeps it a string so
//   bigint                  → string  ⚠  arbitrary precision is not lost.
//
// The two ⚠ rows are the ones that bite. src/core/ranking.engine.js:63 already
// documents it ("Postgres numeric/SUM comes as a string") and src/utils/grade.js
// parseFloat()s marks for the same reason. Typed as `string` here so any arithmetic
// on them fails to compile until it is explicitly converted.
//
// ── Nullability convention ──
// A column that is nullable in SQL but always populated by a DEFAULT (created_at,
// updated_at, is_active, …) is typed non-null. Writing `Date | null` for every
// `DEFAULT CURRENT_TIMESTAMP` column would force null checks that can never fire.
// Columns that are genuinely nullable — no NOT NULL and no DEFAULT, e.g.
// users.role_id or students.user_id — keep `| null`.
// ─────────────────────────────────────────────────────────────────────────────

/** Any value jsonb can hold after parsing. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

// ─────────────────────────────────────────────────────────────────────────────
// Enums
//
// Declared as `as const` arrays with the union derived from them, so the runtime
// list and the compile-time type can never drift apart. src/utils/validators.js
// currently keeps its own copies (GENDERS, EXAM_TYPES, …) — when it becomes
// validators.ts in phase 2 it should re-export from here instead of redeclaring.
// ─────────────────────────────────────────────────────────────────────────────

/** gender_enum */
export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export type Gender = (typeof GENDERS)[number];

/** exam_type_enum */
export const EXAM_TYPES = ['ADMISSION', 'MIDTERM', 'FINAL', 'UNIT_TEST'] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

/** exam_status_enum — DRAFT until someone publishes; only PUBLISHED counts for ranking */
export const EXAM_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

/** enrollment_type_enum */
export const ENROLLMENT_TYPES = ['OLD', 'NEW'] as const;
export type EnrollmentType = (typeof ENROLLMENT_TYPES)[number];

/** student_attendance.status — a CHECK constraint on varchar(20), not a real PG enum */
export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** ranking_action_enum */
export const RANKING_ACTIONS = [
  'GENERATE',
  'RECALCULATE',
  'UNLOCK',
  'LOCK',
  'AUTO_TRIGGER',
  'AUTO_TRIGGER_SKIP',
] as const;
export type RankingAction = (typeof RANKING_ACTIONS)[number];

/** upload_category_enum */
export const UPLOAD_CATEGORIES = [
  'STUDENT_PROFILE',
  'TEACHER_PROFILE',
  'SCHOOL_LOGO',
  'ASSIGNMENT',
  'QUESTION_PAPER',
  'ANSWER_SHEET',
  'EXAM_ATTACHMENT',
  'LEAVE_ATTACHMENT',
  'ATTENDANCE_PROOF',
  'CERTIFICATE',
  'NOTICE_ATTACHMENT',
  'OTHER',
] as const;
export type UploadCategory = (typeof UPLOAD_CATEGORIES)[number];

/** upload_status_enum — PENDING (URL issued) → READY (confirmed) */
export const UPLOAD_STATUSES = ['PENDING', 'READY', 'FAILED'] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Shared column groups
//
// Deliberately NOT a single "BaseRow" — the tables genuinely differ. ranking_history
// has only generated_at, ranking_locks has no deleted_at, error_logs has no
// updated_at. Composing from these pieces keeps each row honest.
// ─────────────────────────────────────────────────────────────────────────────

export interface Timestamped {
  created_at: Date;
  updated_at: Date;
}

/** Soft delete — NULL means alive. Every list query filters on `deleted_at IS NULL`. */
export interface SoftDeletable {
  deleted_at: Date | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// RBAC
// ─────────────────────────────────────────────────────────────────────────────

export interface PermissionRow extends Timestamped, SoftDeletable {
  id: string;
  /** UPPER_SNAKE, e.g. 'STUDENT_READ' */
  name: string;
}

export interface RoleRow extends Timestamped, SoftDeletable {
  id: string;
  /** e.g. 'SUPER_ADMIN', 'TEACHER' */
  name: string;
}

export interface RolePermissionRow extends Timestamped, SoftDeletable {
  id: string;
  role_id: string;
  permission_id: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// People
// ─────────────────────────────────────────────────────────────────────────────

export interface UserRow extends Timestamped, SoftDeletable {
  id: string;
  full_name: string;
  email: string;
  /** bcrypt hash — never send this to a client (auth.service strips it) */
  password: string;
  /** nullable in SQL: a user can exist without a role */
  role_id: string | null;
  is_active: boolean;
  gender: Gender;
}

export interface TeacherRow extends Timestamped, SoftDeletable {
  id: string;
  user_id: string | null;
  phone: string | null;
  designation: string | null;
  qualification: string | null;
  joining_date: Date | null;
}

export interface StudentRow extends Timestamped, SoftDeletable {
  id: string;
  /** generated as STU-<year>-<seq>, e.g. STU-2026-001 */
  student_code: string;
  date_of_birth: Date | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  address: string | null;
  user_id: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Academic structure
// ─────────────────────────────────────────────────────────────────────────────

export interface AcademicSessionRow extends Timestamped, SoftDeletable {
  id: string;
  name: string;
  start_date: Date | null;
  end_date: Date | null;
  is_active: boolean;
  admission_test_enabled: boolean;
}

export interface ClassRow extends Timestamped, SoftDeletable {
  id: string;
  name: string;
}

export interface SectionRow extends Timestamped, SoftDeletable {
  id: string;
  class_id: string | null;
  name: string;
  /** NULL = unlimited; roll distribution treats it as no cap */
  max_capacity: number | null;
}

export interface SubjectRow extends Timestamped, SoftDeletable {
  id: string;
  name: string;
  code: string | null;
}

export interface SubjectAssignmentRow extends Timestamped, SoftDeletable {
  id: string;
  teacher_id: string | null;
  class_id: string | null;
  section_id: string | null;
  subject_id: string | null;
  academic_session_id: string | null;
  /** the user who created the assignment */
  assigned_by: string | null;
}

export interface StudentEnrollmentRow extends Timestamped, SoftDeletable {
  id: string;
  student_id: string | null;
  class_id: string | null;
  section_id: string | null;
  academic_session_id: string | null;
  /** assigned by the roll engine after ranking; NULL until then */
  roll_number: number | null;
  /** backfilled from created_at by migration 001 */
  admission_date: Date | null;
  ranking_locked: boolean;
  enrollment_type: EnrollmentType;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exams
// ─────────────────────────────────────────────────────────────────────────────

export interface ExamRow extends Timestamped, SoftDeletable {
  id: string;
  name: string;
  class_id: string | null;
  academic_session_id: string | null;
  exam_date: Date | null;
  exam_type: ExamType;
  status: ExamStatus;
}

export interface ExamResultRow extends Timestamped, SoftDeletable {
  id: string;
  exam_id: string | null;
  student_id: string | null;
  subject_id: string | null;
  /** numeric(5,2) → string. Convert before arithmetic (see grade.js). */
  marks: string | null;
  grade: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Attendance & leave
// ─────────────────────────────────────────────────────────────────────────────

export interface StudentAttendanceRow extends Timestamped, SoftDeletable {
  id: string;
  student_id: string | null;
  class_id: string | null;
  section_id: string | null;
  attendance_date: Date | null;
  status: AttendanceStatus | null;
}

/** Staff/teacher check-in-check-out log (not students) */
export interface AttendanceLogRow extends Timestamped, SoftDeletable {
  id: string;
  user_id: string;
  attendance_date: Date;
  check_in: Date | null;
  check_out: Date | null;
  total_work_minutes: number;
  /** plain varchar(20), no CHECK constraint — defaults to 'PRESENT' */
  status: string;
  notes: string | null;
  ip_address: string | null;
  /** numeric → string */
  check_in_latitude: string | null;
  check_in_longitude: string | null;
  check_out_latitude: string | null;
  check_out_longitude: string | null;
}

export interface LeaveRow extends Timestamped, SoftDeletable {
  id: string;
  user_id: string | null;
  leave_type: string | null;
  start_date: Date | null;
  end_date: Date | null;
  reason: string | null;
  /** varchar(20), defaults to 'PENDING' */
  status: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fees
// ─────────────────────────────────────────────────────────────────────────────

export interface FeeStructureRow extends Timestamped, SoftDeletable {
  id: string;
  class_id: string | null;
  academic_session_id: string | null;
  /** numeric(10,2) → string */
  amount: string;
  due_date: Date | null;
  description: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Roll & rank system (migrations 001, 002)
// ─────────────────────────────────────────────────────────────────────────────

/** Per class+session lock. No deleted_at on this table. */
export interface RankingLockRow extends Timestamped {
  id: string;
  class_id: string;
  academic_session_id: string;
  is_locked: boolean;
  locked_at: Date | null;
  locked_by: string | null;
}

/** Snapshot written on every generate/recalculate. Has generated_at only. */
export interface RankingHistoryRow {
  id: string;
  academic_session_id: string;
  class_id: string;
  student_id: string;
  /** numeric(7,2) → string */
  total_score: string;
  rank_position: number;
  roll_number: number;
  version: number;
  generated_at: Date;
}

/** Append-only trail. Has created_at only. */
export interface RankingAuditLogRow {
  id: string;
  action: RankingAction;
  class_id: string;
  academic_session_id: string;
  /** NULL = performed by the system (auto-trigger), not a user */
  actor_id: string | null;
  from_version: number | null;
  to_version: number | null;
  detail: Json | null;
  created_at: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error logs (migration 003)
// ─────────────────────────────────────────────────────────────────────────────

/** Soft-deletable, but has no updated_at. */
export interface ErrorLogRow extends SoftDeletable {
  id: string;
  /** error constructor name: 'Error', 'TypeError', 'AppError', … */
  name: string | null;
  message: string;
  stack: string | null;
  status_code: number | null;
  /** true = a thrown AppError, false = an unexpected crash */
  is_operational: boolean;
  method: string | null;
  path: string | null;
  context: Json | null;
  user_id: string | null;
  created_at: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Uploads (migration 004)
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadRow extends Timestamped, SoftDeletable {
  id: string;
  /** full object key inside the bucket — generated server-side, never client-supplied */
  storage_key: string;
  original_name: string;
  mime_type: string;
  /** lowercase, no dot: 'png', 'pdf', 'xlsx' */
  extension: string;
  /** bigint → string ⚠ convert before comparing against a byte limit */
  file_size: string;
  category: UploadCategory;
  status: UploadStatus;
  uploaded_by: string;
  checksum: string | null;
  /** NOT NULL, defaults to {} */
  metadata: Json;
  /** optional polymorphic link to any entity */
  related_type: string | null;
  related_id: string | null;
}

export interface UploadAuditLogRow {
  id: string;
  upload_id: string;
  /** GENERATE_URL | CONFIRM | DOWNLOAD | DELETE | RESTORE */
  action: string;
  actor_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  /** NOT NULL, defaults to {} */
  detail: Json;
  created_at: Date;
}
