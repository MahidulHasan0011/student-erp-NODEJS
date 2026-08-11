import type { ListQuery, OrderClause } from '../types/common.types.js';
import { firstString } from './queryParam.js';

/**
 * simple table sorting
 *
 * `allowedFields` maps a public sort key to the real SQL column ({ full_name: 'u.full_name' }).
 * Anything not in that map falls back to `defaultField`, which is what keeps the
 * interpolated ORDER BY free of user input.
 */
export const buildOrder = (
  queryOptions: ListQuery,
  allowedFields: Record<string, string>, // always Object only
  defaultField = 'created_at',
): OrderClause => {
  // firstString, not a raw read: `?sortBy=a&sortBy=b` arrives as an array, and the
  // allow-list lookup below would miss it while `.toUpperCase()` on sortOrder threw.
  const requestedBy = firstString(queryOptions.sortBy);

  // if the requested sortBy is not in allowedFields → use the default
  const sortKey = requestedBy && allowedFields[requestedBy] ? requestedBy : defaultField;
  const sortBy = allowedFields[sortKey];

  const sortOrder = firstString(queryOptions.sortOrder)?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  return { sortBy, sortOrder };
};
