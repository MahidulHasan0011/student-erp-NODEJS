import type { Response } from 'express';
import type { ApiErrorBody, ApiSuccessBody, PaginationMeta } from '../types/common.types.js';

export interface SuccessResponseOptions<T> {
  message?: string;
  data?: T | null;
  meta?: PaginationMeta | null;
  statusCode?: number;
}

export interface ErrorResponseOptions {
  message?: string;
  errors?: unknown;
  statusCode?: number;
}

/** `data` / `meta` are left out of the body entirely when null, not sent as null. */
export const successResponse = <T = unknown>(
  res: Response,
  {
    message = 'Success',
    data = null,
    meta = null,
    statusCode = 200,
  }: SuccessResponseOptions<T> = {},
): Response => {
  const body: ApiSuccessBody<T> = { success: true, message };
  if (data !== null) body.data = data;
  if (meta !== null) body.meta = meta;
  return res.status(statusCode).json(body);
};

export const errorResponse = (
  res: Response,
  { message = 'Something went wrong', errors = null, statusCode = 500 }: ErrorResponseOptions = {},
): Response => {
  const body: ApiErrorBody = { success: false, message };
  if (errors !== null) body.errors = errors;
  return res.status(statusCode).json(body);
};
