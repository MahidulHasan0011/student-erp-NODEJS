import { subjectAssignmentService } from './subject-assignment.service.js';
import { requireUser } from '../../middlewares/auth.middleware.js';
import { successResponse } from '../../utils/response.js';
import type { Handler } from '../../types/http.types.js';

type SubjectAssignmentController = Record<
  'create' | 'getAll' | 'getById' | 'getByTeacher' | 'update' | 'delete',
  Handler
>;

export const subjectAssignmentController: SubjectAssignmentController = {
  async create(req, res, next) {
    try {
      const data = await subjectAssignmentService.create({
        ...req.body,
        assigned_by: requireUser(req).userId, // logged-in admin coming from auth.middleware.js
      });
      return successResponse(res, {
        message: 'Subject assigned to teacher',
        data,
        statusCode: 201,
      });
    } catch (err) {
      next(err);
    }
  },

  async getAll(req, res, next) {
    try {
      const { data, meta } = await subjectAssignmentService.getAll(req.query);
      return successResponse(res, { message: 'Subject assignments fetched', data, meta });
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const data = await subjectAssignmentService.getById(req.params.id);
      return successResponse(res, { message: 'Subject assignment fetched', data });
    } catch (err) {
      next(err);
    }
  },

  // GET /subject-assignments/teacher/:teacherId
  async getByTeacher(req, res, next) {
    try {
      const data = await subjectAssignmentService.getByTeacher(req.params.teacherId);
      return successResponse(res, { message: "Teacher's assignments fetched", data });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const data = await subjectAssignmentService.update(req.params.id, {
        ...req.body,
        assigned_by: requireUser(req).userId, // logged-in admin who made this change — kept as a log
      });
      return successResponse(res, { message: 'Subject assignment updated', data });
    } catch (err) {
      next(err);
    }
  },

  async delete(req, res, next) {
    try {
      await subjectAssignmentService.delete(req.params.id);
      return successResponse(res, { message: 'Subject assignment deleted' });
    } catch (err) {
      next(err);
    }
  },
};
