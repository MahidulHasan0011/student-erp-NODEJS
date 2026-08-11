import type { ListQuery } from '../types/common.types.js';
import { firstString, toParamValue } from './queryParam.js';

/** One entry in `filterableColumns`. */
export type FilterEntry =
  /** query param and SQL column share a name */
  | string
  /** use this form when the SQL column is alias-qualified */
  | { param: string; column: string };

export interface FilterConfig {
  searchableColumns?: readonly string[];
  filterableColumns?: readonly FilterEntry[];
}

/**
 * Running placeholder counter, shared with the caller so `$1, $2, …` stay in step
 * with the `values` array across the WHERE clause and the trailing LIMIT/OFFSET.
 * An object because the caller needs to see the increments.
 */
export interface ParamCounter {
  value: number;
}

// WHERE clause builder — soft delete + search + filter
//
// config.filterableColumns takes two formats:
//   ["status"]                          → query param and SQL column have the same name
//   [{ param: "role_id", column: "u.role_id" }]  → use this form when the SQL column has an alias
export const buildWhereClause = (
  queryOptions: ListQuery,
  values: unknown[],
  config: FilterConfig,
  countRef: ParamCounter,
  baseAlias = '',
): string => {
  let where = baseAlias ? `WHERE ${baseAlias}.deleted_at IS NULL` : `WHERE deleted_at IS NULL`;

  // SEARCH — always text, so collapse it to a string
  const search = firstString(queryOptions.search);
  if (search && config.searchableColumns?.length) {
    const searchConditions = config.searchableColumns.map((col) => {
      const param = `$${countRef.value}`;
      values.push(`%${search}%`);
      countRef.value++;
      return `${col} ILIKE ${param}`;
    });

    where += ` AND (${searchConditions.join(' OR ')})`;
  }

  // FILTER
  if (config.filterableColumns) {
    for (const entry of config.filterableColumns) {
      // if given a string, the param name and column name are assumed to be the same
      const { param, column } = typeof entry === 'string' ? { param: entry, column: entry } : entry;

      // toParamValue, not firstString: a caller may have normalised the value already
      // (is_active becomes a real boolean in academic-session/user repositories) and
      // coercing it back to text here would drop the filter.
      const value = toParamValue(queryOptions[param]);

      if (value !== undefined && value !== '') {
        where += ` AND ${column} = $${countRef.value}`;
        values.push(value);
        countRef.value++;
      }
    }
  }

  return where;
};
