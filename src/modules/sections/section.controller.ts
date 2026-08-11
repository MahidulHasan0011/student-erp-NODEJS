import { sectionService } from './section.service.js';
import { successResponse } from '../../utils/response.js';
import type { Handler } from '../../types/http.types.js';

// Annotating the object (rather than casting each method) is what gives req/res/next
// their types — TypeScript contextually types the handlers from this map, and naming
// the keys keeps a typo in the route file a compile error.
type SectionController = Record<
  'create' | 'getAll' | 'getById' | 'getOccupancy' | 'update' | 'delete',
  Handler
>;

export const sectionController: SectionController = {
  async create(req, res, next) {
    try {
      const data = await sectionService.create(req.body);
      return successResponse(res, { message: 'Section created', data, statusCode: 201 });
    } catch (err) {
      next(err);
    }
  },

  async getAll(req, res, next) {
    try {
      const { data, meta } = await sectionService.getAll(req.query);
      return successResponse(res, { message: 'Sections fetched', data, meta });
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const data = await sectionService.getById(req.params.id);
      return successResponse(res, { message: 'Section fetched', data });
    } catch (err) {
      next(err);
    }
  },

  // GET /sections/:id/occupancy
  async getOccupancy(req, res, next) {
    try {
      const data = await sectionService.getOccupancy(req.params.id);
      return successResponse(res, { message: 'Section occupancy fetched', data });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const data = await sectionService.update(req.params.id, req.body);
      return successResponse(res, { message: 'Section updated', data });
    } catch (err) {
      next(err);
    }
  },

  async delete(req, res, next) {
    try {
      await sectionService.delete(req.params.id);
      return successResponse(res, { message: 'Section deleted' });
    } catch (err) {
      next(err);
    }
  },
};
