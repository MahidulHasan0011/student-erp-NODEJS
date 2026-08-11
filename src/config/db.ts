import pg from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from './env.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool
  .connect()
  .then((client) => {
    console.log('DB Connected Successfully');
    client.release();
  })
  .catch((err) => console.error('DB ERROR:', err));

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err);
});

/**
 * Run a query and get typed rows back.
 *
 * The type parameter is the whole point of this wrapper: pass the row shape and the
 * result is checked all the way up through the repository —
 *   const { rows } = await query<StudentRow>('SELECT * FROM students');
 * A repository that SELECTs a subset or a JOIN should pass its own projection type
 * rather than a full table row, so the type stays honest about the columns asked for.
 *
 * Left defaulted to QueryResultRow so the existing untyped .js callers still compile.
 */
export const query = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> => pool.query<T>(text, params);

/**
 * BEGIN → callback → COMMIT, with ROLLBACK on any throw and a guaranteed release.
 * Generic over the callback's return so the value flows through untouched.
 */
export const withTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export default pool;
