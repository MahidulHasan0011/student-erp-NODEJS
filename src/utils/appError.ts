/**
 * Operational error — something the caller did wrong (validation, not found, conflict),
 * as opposed to a crash. errorMiddleware keys off `isOperational` to decide whether the
 * message is safe to show the client or whether it needs logging to error_logs.
 *
 * Note: `name` is deliberately NOT set, so it stays 'Error' just as it did before —
 * error-log.service records it and changing it would change existing log data.
 */
export class AppError extends Error {
  readonly statusCode: number;
  /** field-level detail, e.g. { email: 'already in use' } */
  readonly errors: unknown;
  readonly isOperational = true;

  constructor(message: string, statusCode = 500, errors: unknown = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}
