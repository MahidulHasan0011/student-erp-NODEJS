import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';

// ── Full flow test that requires DB + Redis ──
// Skipped by default — because it needs a live Postgres + Redis + seed data.
// To run:  TEST_INTEGRATION=1 npm test
// First make sure:  npm run db:fresh  (a seeded admin user must exist)
const RUN = process.env.TEST_INTEGRATION === '1';

// provide the super_admin/admin credentials from seed.sql here (can be overridden via env)
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@school.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'Password@123'; // seed.sql default

describe.skipIf(!RUN)('auth flow (DB + Redis)', () => {
  let app: Express;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const redis = (await import('../../src/config/redis.js')).default;
    if (!redis.isOpen) await redis.connect();
    app = (await import('../../src/app.js')).default;
  });

  afterAll(async () => {
    const redis = (await import('../../src/config/redis.js')).default;
    if (redis.isOpen) await redis.quit();
    const pool = (await import('../../src/config/db.js')).default;
    await pool.end();
  });

  it('login → accessToken + refreshToken', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('GET /auth/me works with token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(ADMIN_EMAIL.toLowerCase());
  });

  it('refresh → new token pair', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('wrong password → 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });
});
