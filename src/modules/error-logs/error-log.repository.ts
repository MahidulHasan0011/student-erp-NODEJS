import { query } from '../../config/db.js';
import { buildWhereClause, type FilterConfig } from '../../utils/queryBuilder.js';
import { buildOrder } from '../../utils/order.js';
import type { ListQuery, Pagination } from '../../types/common.types.js';
import type { ErrorLogRow, Json } from '../../types/db.types.js';

/** camelCase in, snake_case columns out — the mapping happens in create(). */
export interface CreateErrorLogData {
  name?: string | null;
  message: string;
  stack?: string | null;
  statusCode?: number | null;
  isOperational?: boolean;
  method?: string | null;
  path?: string | null;
  context?: Json | null;
  userId?: string | null;
}

const SORTABLE_FIELDS: Record<string, string> = {
  created_at: 'created_at',
  status_code: 'status_code',
};

const FILTER_CONFIG: FilterConfig = {
  searchableColumns: ['message', 'path'],
  filterableColumns: ['status_code', 'user_id', 'method', 'is_operational'],
};

export const errorLogRepository = {
  async create({
    name,
    message,
    stack,
    statusCode,
    isOperational,
    method,
    path,
    context,
    userId,
  }: CreateErrorLogData): Promise<ErrorLogRow> {
    const { rows } = await query<ErrorLogRow>(
      `INSERT INTO error_logs
        (name, message, stack, status_code, is_operational, method, path, context, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        name || null,
        message,
        stack || null,
        statusCode ?? null,
        isOperational ?? false,
        method || null,
        path || null,
        context ? JSON.stringify(context) : null,
        userId || null,
      ],
    );
    return rows[0];
  },

  async findAll(
    queryOptions: ListQuery,
    { limit, offset }: Pick<Pagination, 'limit' | 'offset'>,
  ): Promise<ErrorLogRow[]> {
    const values: unknown[] = [];
    const countRef = { value: 1 };

    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef);
    const { sortBy, sortOrder } = buildOrder(queryOptions, SORTABLE_FIELDS, 'created_at');

    values.push(limit, offset);
    const limitIdx = countRef.value;
    const offsetIdx = countRef.value + 1;

    const { rows } = await query<ErrorLogRow>(
      `SELECT * FROM error_logs
       ${where}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      values,
    );
    return rows;
  },

  async countAll(queryOptions: ListQuery): Promise<number> {
    const values: unknown[] = [];
    const countRef = { value: 1 };
    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef);
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM error_logs ${where}`,
      values,
    );
    return parseInt(rows[0].count);
  },

  async findById(id: string): Promise<ErrorLogRow | null> {
    const { rows } = await query<ErrorLogRow>(
      `SELECT * FROM error_logs WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] || null;
  },

  async softDelete(id: string): Promise<{ id: string } | null> {
    const { rows } = await query<{ id: string }>(
      `UPDATE error_logs SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    return rows[0] || null;
  },

  // soft-delete all (or those before a given date) logs at once — to keep the log table clean
  // rowCount is nullable in pg's types (it is null for statements that report no count)
  async clear(before: string | null): Promise<number | null> {
    if (before) {
      const { rowCount } = await query(
        `UPDATE error_logs SET deleted_at = NOW()
         WHERE deleted_at IS NULL AND created_at < $1`,
        [before],
      );
      return rowCount;
    }
    const { rowCount } = await query(
      `UPDATE error_logs SET deleted_at = NOW() WHERE deleted_at IS NULL`,
    );
    return rowCount;
  },
};
