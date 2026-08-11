import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RUN, API, uniq, connect, disconnect, get, post, del } from './_helpers.js';

// role-permission write-ops need ROLE_UPDATE + role CREATE/DELETE — only SUPER_ADMIN has them.
async function superAdminToken(app: Express) {
  const res = await request(app)
    .post(`${API}/auth/login`)
    .send({ email: 'superadmin@school.com', password: 'Password@123' });
  const token = res.body?.data?.accessToken;
  if (!token) throw new Error(`Super-admin login failed (status ${res.status})`);
  return token;
}

describe.skipIf(!RUN)('Role-Permissions API (integration)', () => {
  let app: Express;
  let token: string;
  let roleId: string; // fresh role created for the test
  let permissionId: string; // real permission to assign/revoke

  beforeAll(async () => {
    ({ app } = await connect());
    token = await superAdminToken(app);

    // create a fresh role — so the seed role's state is not corrupted
    const roleRes = await post(app, token, '/roles', { name: uniq('RPROLE') });
    expect([200, 201]).toContain(roleRes.status);
    roleId = roleRes.body.data.id;

    // create our own permission — to avoid a race with a sibling suite
    const permRes = await post(app, token, '/permissions', { name: uniq('RPPERM') });
    expect([200, 201]).toContain(permRes.status);
    permissionId = permRes.body.data.id;
    expect(permissionId).toBeTruthy();
  });

  afterAll(async () => {
    // cleanup — delete the created role + permission
    if (roleId) await del(app, token, `/roles/${roleId}`);
    if (permissionId) await del(app, token, `/permissions/${permissionId}`);
    await disconnect();
  });

  it('GET /role-permissions/role/{roleId} → 200 + array', async () => {
    const res = await get(app, token, `/role-permissions/role/${roleId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /role-permissions without token → 401', async () => {
    const res = await get(app, 'invalid-token', `/role-permissions/role/${roleId}`);
    expect(res.status).toBe(401);
  });

  it('POST /role-permissions → 201 permission assign', async () => {
    const res = await post(app, token, '/role-permissions', { roleId, permissionId });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
  });

  it('POST /role-permissions same again → 409', async () => {
    const res = await post(app, token, '/role-permissions', { roleId, permissionId });
    expect(res.status).toBe(409);
  });

  it('POST /role-permissions incomplete body → 400', async () => {
    const res = await post(app, token, '/role-permissions', { roleId });
    expect(res.status).toBe(400);
  });

  it('GET /role-permissions/role/{roleId} → the assigned permission is visible', async () => {
    const res = await get(app, token, `/role-permissions/role/${roleId}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map(
      (rp: { permission_id?: string; permissionId?: string }) =>
        rp.permission_id || rp.permissionId,
    );
    expect(ids).toContain(permissionId);
  });

  it('DELETE /role-permissions → 200 permission revoke', async () => {
    const res = await del(app, token, '/role-permissions').send({ roleId, permissionId });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /role-permissions again (no assignment) → 404', async () => {
    const res = await del(app, token, '/role-permissions').send({ roleId, permissionId });
    expect(res.status).toBe(404);
  });
});
