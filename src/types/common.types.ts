// ─────────────────────────────────────────────────────────────────────────────
// Cross-cutting types: pagination, list queries, and the JSON envelope every
// endpoint responds with.
//
// Module-specific input DTOs and JOIN/projection shapes do NOT belong here —
// they live next to the module that owns them (phase 4).
// ─────────────────────────────────────────────────────────────────────────────

/** What getPagination() resolves a raw ?page/?limit into. */
export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

/** The `meta` block buildMeta() attaches to every paginated list response. */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/** What a service returns for a list endpoint: the page plus its meta. */
export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

/**
 * A raw query-string bag, straight off `req.query`.
 *
 * Values are `unknown`, not `string`, and that is deliberate. Everything in a URL
 * is text, but a REPEATED parameter arrives as an array: `?sortOrder=asc&sortOrder=desc`
 * gives `['asc', 'desc']`, not `'desc'`. Typing these as `string` would be a
 * promise the HTTP layer does not keep, and would hide exactly the bug it should
 * catch. Narrow before use.
 *
 * Typed loosely enough that `req.query` is assignable without a cast.
 *
 * Well-known keys, all optional:
 *   page, limit    → getPagination()
 *   sortBy, sortOrder → buildOrder()
 *   search         → buildWhereClause()
 *   …plus whatever a module declares in its own FILTER_CONFIG.
 */
export interface ListQuery {
  [key: string]: unknown;
}

/** buildOrder() output — already validated against the module's allow-list. */
export interface OrderClause {
  /** a real, allow-listed SQL column (possibly alias-qualified, e.g. 'u.full_name') */
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
}

// ─────────────────────────────────────────────────────────────────────────────
// Response envelope — matches src/utils/response.js exactly.
// `data` and `meta` are omitted from the body when null, hence optional.
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiSuccessBody<T = unknown> {
  success: true;
  message: string;
  data?: T;
  meta?: PaginationMeta;
}

export interface ApiErrorBody {
  success: false;
  message: string;
  /** field-level detail when present, e.g. { email: 'already in use' } */
  errors?: unknown;
}

export type ApiBody<T = unknown> = ApiSuccessBody<T> | ApiErrorBody;
