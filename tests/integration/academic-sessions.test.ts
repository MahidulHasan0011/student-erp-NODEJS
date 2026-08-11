import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { RUN, SEED, uniq, connect, disconnect, get, post, patch, del } from './_helpers.js';

describe.skipIf(!RUN)('Academic-Sessions API (integration)', () => {
  let app: Express;
  let token: string;
  let createdId: string; // session created in this suite — the seeded active session will not be touched

  beforeAll(async () => {
    ({ app, token } = await connect());
  });
  afterAll(async () => {
    await disconnect();
  });

  it('GET /academic-sessions → 200 + paginated list', async () => {
    const res = await get(app, token, '/academic-sessions');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('GET /academic-sessions without token → 401', async () => {
    const res = await get(app, 'invalid-token', '/academic-sessions');
    expect(res.status).toBe(401);
  });

  it('GET /academic-sessions/active → 200 (seeded active session)', async () => {
    const res = await get(app, token, '/academic-sessions/active');
    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(true);
  });

  it('POST /academic-sessions → 201 create new session', async () => {
    const res = await post(app, token, '/academic-sessions', {
      name: uniq('SESSION'),
      start_date: '2027-01-01',
      end_date: '2027-12-31',
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    createdId = res.body.data.id;
  });

  it('POST /academic-sessions incomplete body → 400', async () => {
    const res = await post(app, token, '/academic-sessions', { start_date: '2027-01-01' });
    expect(res.status).toBe(400);
  });

  it('GET /academic-sessions/{id} → 200 just-created session', async () => {
    expect(createdId).toBeTruthy();
    const res = await get(app, token, `/academic-sessions/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdId);
  });

  it('GET nonexistent id → 404', async () => {
    const res = await get(app, token, '/academic-sessions/00000000-0000-0000-0000-0000000000ff');
    expect(res.status).toBe(404);
  });

  it('PATCH /academic-sessions/{id} → 200 update (name)', async () => {
    const res = await patch(app, token, `/academic-sessions/${createdId}`, {
      name: uniq('SESSION-UPD'),
    });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdId);
  });

  it('PATCH /academic-sessions/{id}/activate → 200 (created session activated)', async () => {
    const res = await patch(app, token, `/academic-sessions/${createdId}/activate`, {});
    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(true);
    // activate atomically deactivates everything else — restore the seeded active session
    // so that other suites do not break.
    await patch(app, token, `/academic-sessions/${createdId}/deactivate`, {});
    await patch(app, token, `/academic-sessions/${SEED.sessions.active}/activate`, {});
  });

  it('PATCH /academic-sessions/{id}/deactivate → 200 (created session deactivated)', async () => {
    const res = await patch(app, token, `/academic-sessions/${createdId}/deactivate`, {});
    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(false);
  });

  it('PATCH /academic-sessions/{id}/admission-test → 200 (enable)', async () => {
    const res = await patch(app, token, `/academic-sessions/${createdId}/admission-test`, {
      admission_test_enabled: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.admission_test_enabled).toBe(true);
  });

  it('PATCH /admission-test without admission_test_enabled → 400', async () => {
    const res = await patch(app, token, `/academic-sessions/${createdId}/admission-test`, {});
    expect(res.status).toBe(400);
  });

  it('DELETE /academic-sessions/{id} → 200 (deletes because inactive)', async () => {
    // make sure the session is inactive (an active session cannot be deleted)
    await patch(app, token, `/academic-sessions/${createdId}/deactivate`, {});
    const res = await del(app, token, `/academic-sessions/${createdId}`);
    expect(res.status).toBe(200);
  });
});
