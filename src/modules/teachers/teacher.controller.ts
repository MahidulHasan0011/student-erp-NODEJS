import { teacherService } from './teacher.service.js';
import { successResponse } from '../../utils/response.js';
import type { Handler } from '../../types/http.types.js';

type TeacherController = Record<
  'create' | 'getAll' | 'getById' | 'getWithAssignments' | 'update' | 'delete',
  Handler
>;

export const teacherController: TeacherController = {
  async create(req, res, next) {
    try {
      const data = await teacherService.create(req.body);
      return successResponse(res, { message: 'Teacher created', data, statusCode: 201 });
    } catch (err) {
      next(err);
    }
  },

  async getAll(req, res, next) {
    try {
      const { data, meta } = await teacherService.getAll(req.query);
      return successResponse(res, { message: 'Teachers fetched', data, meta });
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const data = await teacherService.getById(req.params.id);
      return successResponse(res, { message: 'Teacher fetched', data });
    } catch (err) {
      next(err);
    }
  },

  // GET /teachers/:id/assignments
  async getWithAssignments(req, res, next) {
    try {
      const data = await teacherService.getByIdWithAssignments(req.params.id);
      return successResponse(res, { message: 'Teacher with assignments fetched', data });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const data = await teacherService.update(req.params.id, req.body);
      return successResponse(res, { message: 'Teacher updated', data });
    } catch (err) {
      next(err);
    }
  },

  async delete(req, res, next) {
    try {
      await teacherService.delete(req.params.id);
      return successResponse(res, { message: 'Teacher deleted' });
    } catch (err) {
      next(err);
    }
  },
};
