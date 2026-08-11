import { errorLogService } from './error-log.service.js';
import { successResponse } from '../../utils/response.js';
import type { Handler } from '../../types/http.types.js';

type ErrorLogController = Record<'getAll' | 'getById' | 'delete' | 'clear', Handler>;

export const errorLogController: ErrorLogController = {
  async getAll(req, res, next) {
    try {
      const { data, meta } = await errorLogService.getAll(req.query);
      return successResponse(res, { message: 'Error logs fetched', data, meta });
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const data = await errorLogService.getById(req.params.id);
      return successResponse(res, { message: 'Error log fetched', data });
    } catch (err) {
      next(err);
    }
  },

  async delete(req, res, next) {
    try {
      await errorLogService.delete(req.params.id);
      return successResponse(res, { message: 'Error log deleted' });
    } catch (err) {
      next(err);
    }
  },

  async clear(req, res, next) {
    try {
      const data = await errorLogService.clear({ before: req.query.before });
      return successResponse(res, { message: 'Error logs cleared', data });
    } catch (err) {
      next(err);
    }
  },
};
