import { examService } from './exam.service.js';
import { successResponse } from '../../utils/response.js';
import type { Handler } from '../../types/http.types.js';

type ExamController = Record<
  'create' | 'getAll' | 'getById' | 'update' | 'publish' | 'unpublish' | 'delete',
  Handler
>;

export const examController: ExamController = {
  async create(req, res, next) {
    try {
      const data = await examService.create(req.body);
      return successResponse(res, { message: 'Exam created', data, statusCode: 201 });
    } catch (err) {
      next(err);
    }
  },

  async getAll(req, res, next) {
    try {
      const { data, meta } = await examService.getAll(req.query);
      return successResponse(res, { message: 'Exams fetched', data, meta });
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const data = await examService.getById(req.params.id);
      return successResponse(res, { message: 'Exam fetched', data });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const data = await examService.update(req.params.id, req.body);
      return successResponse(res, { message: 'Exam updated', data });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /exams/:id/publish — DRAFT → PUBLISHED
  async publish(req, res, next) {
    try {
      const data = await examService.publish(req.params.id);
      return successResponse(res, { message: 'Exam published', data });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /exams/:id/unpublish — PUBLISHED → DRAFT
  async unpublish(req, res, next) {
    try {
      const data = await examService.unpublish(req.params.id);
      return successResponse(res, { message: 'Exam moved back to draft', data });
    } catch (err) {
      next(err);
    }
  },

  async delete(req, res, next) {
    try {
      await examService.delete(req.params.id);
      return successResponse(res, { message: 'Exam deleted' });
    } catch (err) {
      next(err);
    }
  },
};
