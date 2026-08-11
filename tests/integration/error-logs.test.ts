import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RUN, API, connect, disconnect, get, del } from './_helpers.js';

// ERROR_LOG_READ / ERROR_LOG_DELETE permission belongs only to SUPER_ADMIN (seed.sql). The default
// admin@school.com token does not have these — so here we log in separately as superadmin@school.com.
const SUPERADMIN_EMAIL = 'superadmin@school.com';
const SUPERADMIN_PASSWORD = 'Password@123';

describe.skipIf(!RUN)('Error-Logs API (integration)', () => {
  let app: Express;
  let token: string; // superadmin token

  beforeAll(async () => {
    ({ app } = await connect());
    const res = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD });
    token = res.body?.data?.accessToken;
    if (!token) {
      throw new Error(`Superadmin login failed (status ${res.status}). Did you run db:fresh?`);
    }
  });
  afterAll(async () => {
    await disconnect();
  });

  it('GET /error-logs → 200 + list (array, may be empty)', async () => {
    const res = await get(app, token, '/error-logs');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('GET /error-logs without token → 401', async () => {
    const res = await get(app, 'invalid-token', '/error-logs');
    expect(res.status).toBe(401);
  });

  it('GET /error-logs/{id} nonexistent uuid → 404', async () => {
    const res = await get(app, token, '/error-logs/00000000-0000-0000-0000-0000000000ff');
    expect(res.status).toBe(404);
  });

  it('DELETE /error-logs?before=<past date> → 200 (returns cleared count even when empty)', async () => {
    const past = new Date('2000-01-01T00:00:00.000Z').toISOString();
    const res = await del(app, token, `/error-logs?before=${encodeURIComponent(past)}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('cleared');
    expect(typeof res.body.data.cleared).toBe('number');
  });
});
