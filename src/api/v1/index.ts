import { Router } from 'express';
import authRoutes from '../../modules/auth/auth.routes.js';
import roleRoutes from '../../modules/roles/role.routes.js';
import permissionRoutes from '../../modules/permissions/permission.routes.js';
import userRoutes from '../../modules/users/user.routes.js';
import studentRoutes from '../../modules/students/student.routes.js';
import academicSessionRoutes from '../../modules/academic-sessions/academic-session.routes.js';
import teacherRoutes from '../../modules/teachers/teacher.routes.js';
import classRoutes from '../../modules/classes/class.routes.js';
import subjectRoutes from '../../modules/subjects/subject.routes.js';
import sectionRoutes from '../../modules/sections/section.routes.js';
import SubjectassignmentRoutes from '../../modules/subject-assignments/subject-assignment.routes.js';
import studentEnrollmentRoutes from '../../modules/student-enrollments/student-enrollment.routes.js';
import examRoutes from '../../modules/exams/exam.routes.js';
import examResultRoutes from '../../modules/exam-results/exam-result.routes.js';
import rolePermissionRoutes from '../../modules/role-permissions/role-permission.routes.js';
import rankingRoutes from '../../modules/ranking/ranking.routes.js';
import attendanceRoutes from '../../modules/attendance/attendance.routes.js';
import errorLogRoutes from '../../modules/error-logs/error-log.routes.js';
import uploadRoutes from '../../modules/uploads/upload.routes.js';

const router = Router();

// use routes
router.use('/auth', authRoutes);
router.use('/roles', roleRoutes);
router.use('/permissions', permissionRoutes);
router.use('/users', userRoutes);
router.use('/students', studentRoutes);
router.use('/academic-sessions', academicSessionRoutes);
router.use('/teachers', teacherRoutes);
router.use('/classes', classRoutes);
router.use('/subjects', subjectRoutes);
router.use('/sections', sectionRoutes);
router.use('/assignments', SubjectassignmentRoutes);
router.use('/enrollments', studentEnrollmentRoutes);
router.use('/exams', examRoutes);
router.use('/results', examResultRoutes);
router.use('/role-permissions', rolePermissionRoutes);
router.use('/ranking', rankingRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/error-logs', errorLogRoutes);
router.use('/uploads', uploadRoutes);

export default router;
