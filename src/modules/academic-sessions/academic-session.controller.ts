import { academicSessionService } from './academic-session.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import type { Handler } from '../../types/http.types.js';

type AcademicSessionController = Record<
  | 'create'
  | 'getAll'
  | 'getById'
  | 'getActive'
  | 'update'
  | 'activate'
  | 'deactivate'
  | 'toggleAdmissionTest'
  | 'delete',
  Handler
>;

export const academicSessionController: AcademicSessionController = {
  async create(req, res, next) {
    try {
      const data = await academicSessionService.create(req.body);
      return successResponse(res, { message: 'Academic session created', data, statusCode: 201 });
    } catch (err) {
      next(err);
    }
  },

  async getAll(req, res, next) {
    try {
      const { data, meta } = await academicSessionService.getAll(req.query);
      return successResponse(res, { message: 'Academic sessions fetched', data, meta });
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const data = await academicSessionService.getById(req.params.id);
      return successResponse(res, { message: 'Academic session fetched', data });
    } catch (err) {
      next(err);
    }
  },

  // GET /academic-sessions/active
  async getActive(req, res, next) {
    try {
      const data = await academicSessionService.getActive();
      return successResponse(res, { message: 'Active session fetched', data });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const data = await academicSessionService.update(req.params.id, req.body);
      return successResponse(res, { message: 'Academic session updated', data });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /academic-sessions/:id/activate
  async activate(req, res, next) {
    try {
      const data = await academicSessionService.activate(req.params.id);
      return successResponse(res, { message: 'Session activated', data });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /academic-sessions/:id/deactivate
  async deactivate(req, res, next) {
    try {
      const data = await academicSessionService.deactivate(req.params.id);
      return successResponse(res, { message: 'Session deactivated', data });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /academic-sessions/:id/admission-test
  async toggleAdmissionTest(req, res, next) {
    try {
      const { admission_test_enabled } = req.body;
      if (admission_test_enabled === undefined) {
        return errorResponse(res, {
          message: 'admission_test_enabled is required',
          statusCode: 400,
        });
      }
      const data = await academicSessionService.toggleAdmissionTest(
        req.params.id,
        admission_test_enabled,
      );
      return successResponse(res, {
        message: `Admission test ${admission_test_enabled ? 'enabled' : 'disabled'}`,
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async delete(req, res, next) {
    try {
      await academicSessionService.delete(req.params.id);
      return successResponse(res, { message: 'Academic session deleted' });
    } catch (err) {
      next(err);
    }
  },
};
