import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RUN, API, uniq, connect, disconnect, get, post, patch, del } from './_helpers.js';

// permissions write-ops (CREATE/UPDATE/DELETE) are not in the ADMIN role — only in SUPER_ADMIN.
async function superAdminToken(app: Express) {
  const res = await request(app)
    .post(`${API}/auth/login`)
    .send({ email: 'superadmin@school.com', password: 'Password@123' });
  const token = res.body?.data?.accessToken;
  if (!token) throw new Error(`Super-admin login failed (status ${res.status})`);
  return token;
}

describe.skipIf(!RUN)('Permissions API (integration)', () => {
  let app: Express;
  let token: string;
  let createdId: string; // id of the permission created during the lifecycle

  beforeAll(async () => {
    ({ app } = await connect());
    token = await superAdminToken(app);
  });
  afterAll(async () => {
    await disconnect();
  });

  it('GET /permissions → 200 + paginated list', async () => {
    const res = await get(app, token, '/permissions');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('GET /permissions without token → 401', async () => {
    const res = await get(app, 'invalid-token', '/permissions');
    expect(res.status).toBe(401);
  });

  it('POST /permissions → 201 create new permission', async () => {
    const name = uniq('PERM');
    const res = await post(app, token, '/permissions', { name });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.name).toBe(name.toUpperCase());
    createdId = res.body.data.id;
  });

  it('POST /permissions duplicate name → 409', async () => {
    const name = uniq('PERMDUP');
    const first = await post(app, token, '/permissions', { name });
    expect([200, 201]).toContain(first.status);
    const res = await post(app, token, '/permissions', { name });
    expect(res.status).toBe(409);
  });

  it('POST /permissions incomplete body → 400', async () => {
    const res = await post(app, token, '/permissions', {});
    expect(res.status).toBe(400);
  });

  it('GET /permissions/{id} → 200 just-created permission', async () => {
    expect(createdId).toBeTruthy();
    const res = await get(app, token, `/permissions/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdId);
  });

  it('PATCH /permissions/{id} → 200 update', async () => {
    const name = uniq('PERMUPD');
    const res = await patch(app, token, `/permissions/${createdId}`, { name });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe(name.toUpperCase());
  });

  it('GET nonexistent id → 404', async () => {
    const res = await get(app, token, '/permissions/00000000-0000-0000-0000-0000000000ff');
    expect(res.status).toBe(404);
  });

  it('DELETE /permissions/{id} → 200', async () => {
    const res = await del(app, token, `/permissions/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
