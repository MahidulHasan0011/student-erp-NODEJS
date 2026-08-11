import { classService } from './class.service.js';
import { successResponse } from '../../utils/response.js';
import type { Handler } from '../../types/http.types.js';

type ClassController = Record<
  'create' | 'getAll' | 'getById' | 'getWithSections' | 'update' | 'delete',
  Handler
>;

export const classController: ClassController = {
  async create(req, res, next) {
    try {
      const data = await classService.create(req.body);
      return successResponse(res, { message: 'Class created', data, statusCode: 201 });
    } catch (err) {
      next(err);
    }
  },

  async getAll(req, res, next) {
    try {
      const { data, meta } = await classService.getAll(req.query);
      return successResponse(res, { message: 'Classes fetched', data, meta });
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const data = await classService.getById(req.params.id);
      return successResponse(res, { message: 'Class fetched', data });
    } catch (err) {
      next(err);
    }
  },

  // GET /classes/:id/sections
  async getWithSections(req, res, next) {
    try {
      const data = await classService.getByIdWithSections(req.params.id);
      return successResponse(res, { message: 'Class with sections fetched', data });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const data = await classService.update(req.params.id, req.body);
      return successResponse(res, { message: 'Class updated', data });
    } catch (err) {
      next(err);
    }
  },

  async delete(req, res, next) {
    try {
      await classService.delete(req.params.id);
      return successResponse(res, { message: 'Class deleted' });
    } catch (err) {
      next(err);
    }
  },
};
