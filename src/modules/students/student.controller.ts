import { studentService } from './student.service.js';
import { successResponse } from '../../utils/response.js';
import type { Handler } from '../../types/http.types.js';

type StudentController = Record<
  'create' | 'getAll' | 'getById' | 'getWithEnrollment' | 'update' | 'delete',
  Handler
>;

export const studentController: StudentController = {
  async create(req, res, next) {
    try {
      const data = await studentService.create(req.body);
      return successResponse(res, { message: 'Student created', data, statusCode: 201 });
    } catch (err) {
      next(err);
    }
  },

  async getAll(req, res, next) {
    try {
      const { data, meta } = await studentService.getAll(req.query);
      return successResponse(res, { message: 'Students fetched', data, meta });
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const data = await studentService.getById(req.params.id);
      return successResponse(res, { message: 'Student fetched', data });
    } catch (err) {
      next(err);
    }
  },

  // GET /students/:id/enrollment
  async getWithEnrollment(req, res, next) {
    try {
      const data = await studentService.getByIdWithEnrollment(req.params.id);
      return successResponse(res, { message: 'Student with enrollment fetched', data });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const data = await studentService.update(req.params.id, req.body);
      return successResponse(res, { message: 'Student updated', data });
    } catch (err) {
      next(err);
    }
  },

  async delete(req, res, next) {
    try {
      await studentService.delete(req.params.id);
      return successResponse(res, { message: 'Student deleted' });
    } catch (err) {
      next(err);
    }
  },
};
