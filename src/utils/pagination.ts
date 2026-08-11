import type { ListQuery, Pagination, PaginationMeta } from '../types/common.types.js';
import { firstString } from './queryParam.js';

/**
 * ?page / ?limit → a clamped { page, limit, offset }.
 * page floors at 1, limit is clamped to 1..100, and anything unparseable falls back
 * to the default — so a hostile query string can never produce a huge or negative LIMIT.
 */
export const getPagination = (query: ListQuery = {}): Pagination => {
  const page = Math.max(1, parseInt(firstString(query.page) ?? '') || 1);
  const limit = Math.min(100, Math.max(1, parseInt(firstString(query.limit) ?? '') || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

export const buildMeta = ({
  total,
  page,
  limit,
}: {
  total: number;
  page: number;
  limit: number;
}): PaginationMeta => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
  hasNextPage: page * limit < total,
  hasPrevPage: page > 1,
});
