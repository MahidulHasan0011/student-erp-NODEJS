import { userService } from './user.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import type { Handler } from '../../types/http.types.js';

type UserController = Record<
  | 'create'
  | 'getAll'
  | 'getById'
  | 'update'
  | 'changePassword'
  | 'resetPassword'
  | 'toggleActive'
  | 'delete',
  Handler
>;

export const userController: UserController = {
  async create(req, res, next) {
    try {
      const data = await userService.create(req.body);
      return successResponse(res, { message: 'User created', data, statusCode: 201 });
    } catch (err) {
      next(err);
    }
  },

  async getAll(req, res, next) {
    try {
      const { data, meta } = await userService.getAll(req.query);
      return successResponse(res, { message: 'Users fetched', data, meta });
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const data = await userService.getById(req.params.id);
      return successResponse(res, { message: 'User fetched', data });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const data = await userService.update(req.params.id, req.body);
      return successResponse(res, { message: 'User updated', data });
    } catch (err) {
      next(err);
    }
  },

  async changePassword(req, res, next) {
    try {
      await userService.changePassword(req.user.userId, req.body);
      return successResponse(res, { message: 'Password changed successfully' });
    } catch (err) {
      next(err);
    }
  },

  async resetPassword(req, res, next) {
    try {
      const { newPassword } = req.body;
      if (!newPassword)
        return errorResponse(res, { message: 'newPassword required', statusCode: 400 });
      await userService.resetPassword(req.params.id, newPassword);
      return successResponse(res, { message: 'Password reset successfully' });
    } catch (err) {
      next(err);
    }
  },

  async toggleActive(req, res, next) {
    try {
      const { is_active } = req.body;
      if (is_active === undefined)
        return errorResponse(res, { message: 'is_active required', statusCode: 400 });
      const data = await userService.toggleActive(req.params.id, is_active);
      return successResponse(res, {
        message: `User ${is_active ? 'activated' : 'deactivated'}`,
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async delete(req, res, next) {
    try {
      await userService.delete(req.params.id);
      return successResponse(res, { message: 'User deleted' });
    } catch (err) {
      next(err);
    }
  },
};
