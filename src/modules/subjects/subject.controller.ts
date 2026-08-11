import { subjectService } from './subject.service.js';
import { successResponse } from '../../utils/response.js';
import type { Handler } from '../../types/http.types.js';

type SubjectController = Record<'create' | 'getAll' | 'getById' | 'update' | 'delete', Handler>;

export const subjectController: SubjectController = {
  async create(req, res, next) {
    try {
      const data = await subjectService.create(req.body);
      return successResponse(res, { message: 'Subject created', data, statusCode: 201 });
    } catch (err) {
      next(err);
    }
  },

  async getAll(req, res, next) {
    try {
      const { data, meta } = await subjectService.getAll(req.query);
      return successResponse(res, { message: 'Subjects fetched', data, meta });
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const data = await subjectService.getById(req.params.id);
      return successResponse(res, { message: 'Subject fetched', data });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const data = await subjectService.update(req.params.id, req.body);
      return successResponse(res, { message: 'Subject updated', data });
    } catch (err) {
      next(err);
    }
  },

  async delete(req, res, next) {
    try {
      await subjectService.delete(req.params.id);
      return successResponse(res, { message: 'Subject deleted' });
    } catch (err) {
      next(err);
    }
  },
};
