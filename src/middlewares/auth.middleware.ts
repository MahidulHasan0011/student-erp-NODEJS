import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { errorResponse } from '../utils/response.js';
import type { AccessTokenPayload } from '../types/auth.types.js';

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
