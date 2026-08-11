import jwt from 'jsonwebtoken';
import type { Request, RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/appError.js';
import { errorResponse } from '../utils/response.js';
import type { AccessTokenPayload } from '../types/auth.types.js';

/**
 * req.user for a handler that needs it — or a clean 401.
 *
 * `user` is optional on Request because a route can skip authMiddleware, so a controller
 * has to deal with the undefined case somehow. Writing `req.user!` would only *assert*
 * that the guard is there; this *enforces* it. If a route is ever registered without
 * authMiddleware, the client gets a 401 through the normal error envelope instead of the
 * server throwing a TypeError on undefined and answering 500 with a stack trace.
 *
 * On a guarded route the check never fires, so it costs one truthiness test.
 */
export const requireUser = (req: Request): AccessTokenPayload => {
  if (!req.user) throw new AppError('Authentication required', 401);
  return req.user;
};

export const authMiddleware: RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(res, { message: 'Authorization token required', statusCode: 401 });
  }

  const token = authHeader.split(' ')[1];

  try {
    // verify() is typed `string | JwtPayload` because a token can carry a bare string
    // payload. Ours never does — auth.service always signs an object — so the assertion
    // states that, and req.user is typed from types/express.d.ts.
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    req.user = decoded; // { userId, roleId, roleName }
    next();
  } catch (err) {
    // name check rather than `instanceof jwt.TokenExpiredError` — identical to the
    // previous behaviour, and immune to a duplicated jsonwebtoken copy in node_modules
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      return errorResponse(res, { message: 'Token expired', statusCode: 401 });
    }
    return errorResponse(res, { message: 'Invalid token', statusCode: 401 });
  }
};
