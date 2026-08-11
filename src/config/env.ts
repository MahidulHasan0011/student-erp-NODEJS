import dotenv from 'dotenv';
dotenv.config();

export interface Env {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_EXPIRES: string;
  JWT_REFRESH_EXPIRES: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD: string;
  BCRYPT_ROUNDS: number;
  DB_POOL_MAX: number;
  QUEUE_BACKOFF_BASE_MS: number;
  QUEUE_BACKOFF_CAP_MS: number;
  STORAGE_PROVIDER: string;
  STORAGE_ENDPOINT: string;
  STORAGE_REGION: string;
  STORAGE_BUCKET: string;
  STORAGE_ACCESS_KEY: string;
  STORAGE_SECRET_KEY: string;
  STORAGE_UPLOAD_URL_TTL: number;
  STORAGE_DOWNLOAD_URL_TTL: number;
  STORAGE_FORCE_PATH_STYLE: boolean;
}

// `?? ''` before every parseInt: process.env values are string | undefined, and an
// unset variable has to reach parseInt as '' so it yields NaN and the `||` default
// takes over — exactly what happened implicitly before.
export const env: Env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT ?? '', 10) || 4000,
  DATABASE_URL: process.env.DATABASE_URL || '',
  // JWT
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'access_secret_change_in_prod',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'refresh_secret_change_in_prod',
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || '15m',
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES || '7d',
  //  REDIS
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT ?? '') || 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS ?? '') || 12,
  // DB connection pool size — kept small when many workers run at once during tests (DB_POOL_MAX)
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX ?? '') || 20,
  // ── BullMQ retry backoff (exponential + jitter) ──
  QUEUE_BACKOFF_BASE_MS: parseInt(process.env.QUEUE_BACKOFF_BASE_MS ?? '') || 2000, // first retry ~2s
  QUEUE_BACKOFF_CAP_MS: parseInt(process.env.QUEUE_BACKOFF_CAP_MS ?? '') || 30000, // max wait between retries

  // ── Object storage (S3-compatible: AWS S3 / Cloudflare R2 / MinIO) ───────
  // R2   : STORAGE_ENDPOINT = https://<account_id>.r2.cloudflarestorage.com, REGION = 'auto'
  // MinIO: STORAGE_ENDPOINT = http://localhost:9000, FORCE_PATH_STYLE = true, REGION = us-east-1
  // AWS  : leave STORAGE_ENDPOINT empty, REGION = the actual region
  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || 's3', // 's3' | 'r2' | 'minio' (for logging/documentation only)
  STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT || '', // custom endpoint for R2/MinIO; empty for AWS
  STORAGE_REGION: process.env.STORAGE_REGION || 'us-east-1',
  STORAGE_BUCKET: process.env.STORAGE_BUCKET || '',
  STORAGE_ACCESS_KEY: process.env.STORAGE_ACCESS_KEY || '',
  STORAGE_SECRET_KEY: process.env.STORAGE_SECRET_KEY || '',
  // how many seconds the presigned PUT/GET URL stays valid
  STORAGE_UPLOAD_URL_TTL: parseInt(process.env.STORAGE_UPLOAD_URL_TTL ?? '') || 300, // 5 min
  STORAGE_DOWNLOAD_URL_TTL: parseInt(process.env.STORAGE_DOWNLOAD_URL_TTL ?? '') || 300, // 5 min
  // true if path-style is needed (MinIO/some R2 setups); false for AWS virtual-hosted
  STORAGE_FORCE_PATH_STYLE: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
};
