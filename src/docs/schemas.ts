const uuid = { type: 'string', format: 'uuid' };
const ts = { type: 'string', format: 'date-time' };
const date = { type: 'string', format: 'date', nullable: true };

export const entitySchemas = {
  // ── Auth / Users ──────────────────────────────────────────────────────
  User: {
    type: 'object',
    description: 'System user (without password)',
    properties: {
      id: uuid,
      full_name: { type: 'string', example: 'Admin User' },
      email: { type: 'string', format: 'email', example: 'admin@school.com' },
      role_id: { ...uuid, nullable: true },
      role_name: {
        type: 'string',
        nullable: true,
        example: 'super_admin',
        description: 'Comes from JOIN (list/get)',
      },
      gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER'], example: 'MALE' },
      is_active: { type: 'boolean', example: true },
      created_at: ts,
      updated_at: ts,
    },
  },

  Role: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string', example: 'teacher' },
      created_at: ts,
      updated_at: ts,
    },
  },

  Permission: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string', example: 'STUDENT_READ' },
      created_at: ts,
      updated_at: ts,
    },
  },

  // role_permissions assignment row (what the repository returns)
  RolePermission: {
    type: 'object',
    properties: {
      assignment_id: uuid,
      role_id: uuid,
      permission_id: uuid,
      permission_name: { type: 'string', nullable: true, example: 'STUDENT_READ' },
      role_name: { type: 'string', nullable: true, example: 'teacher' },
      created_at: ts,
    },
  },

  // ── Academic structure ────────────────────────────────────────────────
  AcademicSession: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string', example: '2026' },
      start_date: date,
      end_date: date,
      is_active: { type: 'boolean', example: true },
      admission_test_enabled: { type: 'boolean', example: true },
      created_at: ts,
      updated_at: ts,
    },
  },

  Class: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string', example: 'Class 6' },
      created_at: ts,
      updated_at: ts,
    },
  },

  Section: {
    type: 'object',
    properties: {
      id: uuid,
      class_id: { ...uuid, nullable: true },
      name: { type: 'string', example: 'A' },
      max_capacity: { type: 'integer', nullable: true, example: 40 },
      created_at: ts,
      updated_at: ts,
    },
  },

  Subject: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string', example: 'Mathematics' },
      code: { type: 'string', nullable: true, example: 'MATH101' },
      created_at: ts,
      updated_at: ts,
    },
  },

  // ── People ────────────────────────────────────────────────────────────
  Student: {
    type: 'object',
    properties: {
      id: uuid,
      student_code: { type: 'string', example: 'STU-2026-001' },
      date_of_birth: date,
      guardian_name: { type: 'string', nullable: true, example: 'Mr. Karim' },
      guardian_phone: { type: 'string', nullable: true, example: '+8801700000000' },
      address: { type: 'string', nullable: true },
      user_id: { ...uuid, nullable: true },
      full_name: {
        type: 'string',
        nullable: true,
        description: 'From users JOIN',
        example: 'Rahim Uddin',
      },
      email: { type: 'string', format: 'email', nullable: true },
      created_at: ts,
      updated_at: ts,
    },
  },

  Teacher: {
    type: 'object',
    properties: {
      id: uuid,
      user_id: { ...uuid, nullable: true },
      phone: { type: 'string', nullable: true, example: '+8801800000000' },
      designation: { type: 'string', nullable: true, example: 'Senior Teacher' },
      qualification: { type: 'string', nullable: true, example: 'M.Sc in Mathematics' },
      joining_date: date,
      full_name: { type: 'string', nullable: true, description: 'From users JOIN' },
      email: { type: 'string', format: 'email', nullable: true },
      created_at: ts,
      updated_at: ts,
    },
  },

  // ── Assignments / Enrollments ───────────────────────────────────────────
  SubjectAssignment: {
    type: 'object',
    properties: {
      id: uuid,
      teacher_id: { ...uuid, nullable: true },
      class_id: { ...uuid, nullable: true },
      section_id: { ...uuid, nullable: true },
      subject_id: { ...uuid, nullable: true },
      academic_session_id: { ...uuid, nullable: true },
      assigned_by: { ...uuid, nullable: true, description: 'Logged-in admin id (auto-set)' },
      created_at: ts,
      updated_at: ts,
    },
  },

  Enrollment: {
    type: 'object',
    properties: {
      id: uuid,
      student_id: { ...uuid, nullable: true },
      class_id: { ...uuid, nullable: true },
      section_id: { ...uuid, nullable: true },
      academic_session_id: { ...uuid, nullable: true },
      roll_number: { type: 'integer', nullable: true, example: 12 },
      admission_date: date,
      ranking_locked: { type: 'boolean', example: false },
      created_at: ts,
      updated_at: ts,
    },
  },

  // ── Exams / Results ─────────────────────────────────────────────────────
  Exam: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string', example: 'Midterm 2026' },
      class_id: { ...uuid, nullable: true },
      academic_session_id: { ...uuid, nullable: true },
      exam_date: date,
      exam_type: {
        type: 'string',
        enum: ['ADMISSION', 'MIDTERM', 'FINAL', 'UNIT_TEST'],
        example: 'MIDTERM',
      },
      status: { type: 'string', enum: ['DRAFT', 'PUBLISHED'], example: 'DRAFT' },
      created_at: ts,
      updated_at: ts,
    },
  },

  ExamResult: {
    type: 'object',
    properties: {
      id: uuid,
      exam_id: { ...uuid, nullable: true },
      student_id: { ...uuid, nullable: true },
      subject_id: { ...uuid, nullable: true },
      marks: { type: 'number', format: 'float', nullable: true, example: 87.5 },
      grade: { type: 'string', nullable: true, example: 'A' },
      created_at: ts,
      updated_at: ts,
    },
  },

  // ── Ranking ─────────────────────────────────────────────────────────────
  RankingEntry: {
    type: 'object',
    description: 'One row of ranking_history (rank snapshot)',
    properties: {
      id: uuid,
      class_id: uuid,
      academic_session_id: uuid,
      student_id: uuid,
      rank_position: { type: 'integer', example: 1 },
      roll_number: { type: 'integer', example: 5 },
      version: { type: 'integer', example: 2 },
      created_at: ts,
    },
  },

  // generate-roll / recalculate → async job
  RankingJob: {
    type: 'object',
    properties: {
      jobId: { type: 'string', example: 'ranking:<classId>:<sessionId>:auto' },
      status: { type: 'string', example: 'queued' },
      fromVersion: { type: 'integer', nullable: true, example: 1 },
    },
  },

  // ── Uploads ───────────────────────────────────────────────────────────
  Upload: {
    type: 'object',
    description: 'Upload metadata (storage_key is never exposed)',
    properties: {
      id: uuid,
      original_name: { type: 'string', example: 'profile.png' },
      mime_type: { type: 'string', example: 'image/png' },
      extension: { type: 'string', example: 'png' },
      file_size: { type: 'integer', format: 'int64', example: 204800 },
      category: {
        type: 'string',
        enum: [
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
        ],
        example: 'STUDENT_PROFILE',
      },
      status: { type: 'string', enum: ['PENDING', 'READY', 'FAILED'], example: 'READY' },
      uploaded_by: uuid,
      checksum: { type: 'string', nullable: true },
      metadata: { type: 'object', example: {} },
      related_type: { type: 'string', nullable: true, example: 'student' },
      related_id: { ...uuid, nullable: true },
      created_at: ts,
      updated_at: ts,
    },
  },

  // generate-url response (step 1 of pre-signed flow)
  UploadUrlResponse: {
    type: 'object',
    properties: {
      upload_id: uuid,
      method: { type: 'string', example: 'PUT' },
      uploadUrl: { type: 'string', description: 'pre-signed PUT URL (TTL-limited)' },
      headers: { type: 'object', description: 'headers to send with the PUT (e.g. Content-Type)' },
      expiresIn: { type: 'integer', example: 300, description: 'seconds' },
      storage_key: { type: 'string', description: 'object key (needed for confirm)' },
    },
  },

  // ── Error logs ──────────────────────────────────────────────────────────
  ErrorLog: {
    type: 'object',
    properties: {
      id: uuid,
      message: { type: 'string' },
      stack: { type: 'string', nullable: true },
      status_code: { type: 'integer', nullable: true, example: 500 },
      is_operational: { type: 'boolean', example: false },
      method: { type: 'string', nullable: true, example: 'POST' },
      path: { type: 'string', nullable: true, example: '/api/v1/students' },
      context: { type: 'object', nullable: true, description: 'body/params/query/ip/userAgent' },
      user_id: { ...uuid, nullable: true },
      created_at: ts,
    },
  },
};
