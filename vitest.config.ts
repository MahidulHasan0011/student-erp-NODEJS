import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';

// Read .env while the config loads (Node context) — these values are injected into test.env
// below, so they're also available in top-level test-file code (e.g. process.env.TEST_INTEGRATION).
// named import — to avoid the default-interop undefined issue (stable even on a single-file run).
const fileEnv: Record<string, string> = loadEnv()?.parsed ?? {};

export default defineConfig({
  test: {
    // describe/it/expect globals — usable without importing
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // importing app tries to connect the db pool; use a fork pool to avoid a hang when the DB is absent
    pool: 'forks',
    // limited concurrency — so it doesn't exceed the Postgres connection limit (often 15 on hosted).
    // max connections ≈ maxWorkers × DB_POOL_MAX = 2 × 4 = 8
    // `minWorkers: 1` used to sit here too — Vitest 4 removed that option, so it had been
    // silently ignored. Dropped rather than kept as dead config; maxWorkers is the cap that
    // actually matters for the connection limit.
    maxWorkers: 2,
    testTimeout: 20000,
    env: {
      // all values from .env (TEST_INTEGRATION, TEST_ADMIN_*, DATABASE_URL, REDIS_* ...)
      ...fileEnv,
      // forced predictable values for tests — take priority over .env
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'test_access_secret',
      JWT_REFRESH_SECRET: 'test_refresh_secret',
      DB_POOL_MAX: '4', // small pool in tests — so parallel workers × pool doesn't exceed the connection limit
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/jobs/**', 'src/queues/**'],
    },
  },
});
