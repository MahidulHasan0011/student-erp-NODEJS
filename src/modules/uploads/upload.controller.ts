import type { Request } from 'express';
import { requireUser } from '../../middlewares/auth.middleware.js';
import { uploadService } from './upload.service.js';
import type { AuditContext, UploadActor } from './upload.service.js';
import { uploadValidation } from './upload.validation.js';
import { successResponse } from '../../utils/response.js';
import type { Handler } from '../../types/http.types.js';

// extract actor (who) + ctx (from where) from req — needed for the ownership check and audit in the service
// requireUser rather than req.user!: every upload route is behind authMiddleware, and this
// turns that from an assertion into a guarantee — a route added without the guard answers
// 401 instead of crashing on undefined.
const getActor = (req: Request): UploadActor => {
  const user = requireUser(req);
  return {
    userId: user.userId,
    roleId: user.roleId,
    permissions: req.permissions, // set by rbacMiddleware
  };
};
const getCtx = (req: Request): AuditContext => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

type UploadController = Record<
  | 'generateUrl'
  | 'confirm'
  | 'getAll'
  | 'getById'
  | 'download'
  | 'delete'
  | 'restore'
  | 'bulkDelete',
  Handler
>;

export const uploadController: UploadController = {
  // POST /uploads/generate-url
  async generateUrl(req, res, next) {
    try {
      const input = uploadValidation.generateUrl(req.body);
      const data = await uploadService.generateUploadUrl(input, getActor(req), getCtx(req));
      return successResponse(res, {
        message: 'Upload URL generated',
        data,
        statusCode: 201,
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /uploads/confirm
  async confirm(req, res, next) {
    try {
      const input = uploadValidation.confirm(req.body);
      const data = await uploadService.confirmUpload(input, getActor(req), getCtx(req));
      return successResponse(res, { message: 'Upload confirmed', data });
    } catch (err) {
      next(err);
    }
  },

  // GET /uploads
  async getAll(req, res, next) {
    try {
      const filters = uploadValidation.listQuery(req.query);
      // pagination/sort params go straight from the query to the service
      const merged = { ...req.query, ...filters };
      const { data, meta } = await uploadService.list(merged, getActor(req));
      return successResponse(res, { message: 'Files fetched', data, meta });
    } catch (err) {
      next(err);
    }
  },

  // GET /uploads/:id
  async getById(req, res, next) {
    try {
      const id = uploadValidation.id(req.params);
      const data = await uploadService.getById(id, getActor(req));
      return successResponse(res, { message: 'File fetched', data });
    } catch (err) {
      next(err);
    }
  },

  // GET /uploads/:id/download
  async download(req, res, next) {
    try {
      const id = uploadValidation.id(req.params);
      const data = await uploadService.getDownloadUrl(id, getActor(req), getCtx(req));
      return successResponse(res, { message: 'Download URL generated', data });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /uploads/:id
  async delete(req, res, next) {
    try {
      const id = uploadValidation.id(req.params);
      await uploadService.softDelete(id, getActor(req), getCtx(req));
      return successResponse(res, { message: 'File deleted' });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /uploads/:id/restore
  async restore(req, res, next) {
    try {
      const id = uploadValidation.id(req.params);
      const data = await uploadService.restore(id, getActor(req), getCtx(req));
      return successResponse(res, { message: 'File restored', data });
    } catch (err) {
      next(err);
    }
  },

  // POST /uploads/bulk-delete
  async bulkDelete(req, res, next) {
    try {
      const ids = uploadValidation.bulkIds(req.body);
      const data = await uploadService.bulkDelete(ids, getActor(req), getCtx(req));
      return successResponse(res, { message: 'Bulk delete processed', data });
    } catch (err) {
      next(err);
    }
  },
};
