import type { ErrorRequestHandler } from 'express';
import { errorResponse } from '../utils/response.js';
import { errorLogService } from '../modules/error-logs/error-log.service.js';

// A `throw` can carry literally any value, so the handler receives `unknown` and has to
// prove what it is before reading a property. These two guards replace the previous
// unchecked `err.isOperational` / `err.code` reads, keeping exactly the same logic.

/** Anything carrying a truthy isOperational — in practice always an AppError. */
interface OperationalErrorLike {
  message: string;
  statusCode: number;
  errors: unknown;
}
const isOperationalError = (err: unknown): err is OperationalErrorLike =>
  typeof err === 'object' &&
  err !== null &&
  Boolean((err as { isOperational?: unknown }).isOperational);

/** A node-postgres error: `code` is the five-character SQLSTATE. */
interface PgErrorLike {
  code: string;
  column?: string;
}
const isPgError = (err: unknown): err is PgErrorLike =>
  typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';

export const errorMiddleware: ErrorRequestHandler = (err, req, res, _next) => {
  if (isOperationalError(err)) {
    return errorResponse(res, {
      message: err.message,
      errors: err.errors,
      statusCode: err.statusCode,
    });
  }

  if (isPgError(err)) {
    // PostgreSQL unique violation
    if (err.code === '23505') {
      return errorResponse(res, {
        message: 'Duplicate entry — record already exists',
        statusCode: 409,
      });
    }
    // PostgreSQL foreign key violation
    if (err.code === '23503') {
      return errorResponse(res, { message: 'Referenced record does not exist', statusCode: 400 });
    }
    // PostgreSQL not-null violation
    if (err.code === '23502') {
      return errorResponse(res, { message: `Field "${err.column}" is required`, statusCode: 400 });
    }
  }

  // Reaching here means an unexpected error (not operational, not a known DB code) → log it to the DB
  // fire-and-forget: we don't hold the response waiting for the log to succeed; the log service swallows its own errors
  console.error('UNHANDLED ERROR:', err);
  errorLogService.log(err, req);
  return errorResponse(res, { message: 'Internal server error', statusCode: 500 });
};
