import type { Request } from 'express';
import { errorLogRepository } from './error-log.repository.js';
import { AppError } from '../../utils/appError.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import type { ListQuery, Paginated } from '../../types/common.types.js';
import type { ErrorLogRow, Json } from '../../types/db.types.js';

/**
 * The properties log() reads off a thrown value. All optional and unknown-typed because
 * the global handler passes whatever was thrown, which need not be an Error at all.
 */
interface LoggableError {
  name?: unknown;
  message?: unknown;
  stack?: unknown;
  statusCode?: unknown;
  isOperational?: unknown;
}

const asLoggable = (err: unknown): LoggableError =>
  typeof err === 'object' && err !== null ? (err as LoggableError) : {};

const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null);

// safely pulls context from the request object — excluding sensitive headers (auth, cookie)
const buildContext = (req?: Request): Json | null => {
  if (!req) return null;
  return {
    ip: req.ip,
    userAgent: req.headers?.['user-agent'],
    query: req.query,
    params: req.params,
    // body may be large/sensitive — keep it only if present; if needed, redaction can be added here rather than keeping it all
    body: req.body,
  } as Json;
};

export const errorLogService = {
  // called from the global error handler — best-effort, never throws
  // (so that a logging failure doesn't break the actual request flow)
  async log(err: unknown, req?: Request): Promise<ErrorLogRow | null> {
    try {
      const e = asLoggable(err);
      return await errorLogRepository.create({
        name: asString(e.name),
        message: asString(e.message) || 'Unknown error',
        stack: asString(e.stack),
        statusCode: typeof e.statusCode === 'number' ? e.statusCode : 500,
        isOperational: e.isOperational === true,
        method: req?.method,
        path: req?.originalUrl || req?.url,
        context: buildContext(req),
        userId: req?.user?.userId || null,
      });
    } catch (logErr) {
      // if it can't be logged to the DB, at least dump it to the console, but don't break the request
      console.error(
        'Failed to persist error log:',
        logErr instanceof Error ? logErr.message : logErr,
      );
      return null;
    }
  },

  async getAll(queryOptions: ListQuery): Promise<Paginated<ErrorLogRow>> {
    const { page, limit, offset } = getPagination(queryOptions);
    const [data, total] = await Promise.all([
      errorLogRepository.findAll(queryOptions, { limit, offset }),
      errorLogRepository.countAll(queryOptions),
    ]);
    return { data, meta: buildMeta({ total, page, limit }) };
  },

  async getById(id: string): Promise<ErrorLogRow> {
    const log = await errorLogRepository.findById(id);
    if (!log) throw new AppError('Error log not found', 404);
    return log;
  },

  async delete(id: string): Promise<{ id: string }> {
    const deleted = await errorLogRepository.softDelete(id);
    if (!deleted) throw new AppError('Error log not found', 404);
    return deleted;
  },

  // soft-deletes all (or those before ?before=ISODate) logs and returns how many were deleted
  async clear({ before }: { before?: unknown } = {}): Promise<{ cleared: number | null }> {
    const count = await errorLogRepository.clear(typeof before === 'string' ? before : null);
    return { cleared: count };
  },
};
