import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { RUN, SEED, uniq, connect, disconnect, get, post, patch, del } from './_helpers.js';

describe.skipIf(!RUN)('Users API (integration)', () => {
  let app: Express;
  let token: string;
  let createdId: string; // id of the user created across the lifecycle

  beforeAll(async () => {
    ({ app, token } = await connect());
  });
  afterAll(async () => {
    await disconnect();
  });

  it('GET /users → 200 + paginated list', async () => {
    const res = await get(app, token, '/users');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('GET /users without token → 401', async () => {
    const res = await get(app, 'invalid-token', '/users');
    expect(res.status).toBe(401);
  });

  it('POST /users → 201 create new user', async () => {
    const email = `${uniq('user')}@test.school.com`;
    const res = await post(app, token, '/users', {
      full_name: 'Test User',
      email,
      password: 'Password@123',
      role_id: SEED.roles.teacher,
      gender: 'MALE',
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.email).toBe(email);
    createdId = res.body.data.id;
  });

  it('POST /users duplicate email → 409', async () => {
    const email = `${uniq('dup')}@test.school.com`;
    const body = {
      full_name: 'Dup User',
      email,
      password: 'Password@123',
      role_id: SEED.roles.teacher,
    };
    const first = await post(app, token, '/users', body);
    expect([200, 201]).toContain(first.status);
    const res = await post(app, token, '/users', body);
    expect(res.status).toBe(409);
  });

  it('POST /users incomplete body → 400', async () => {
    const res = await post(app, token, '/users', { full_name: 'No Email' });
    expect(res.status).toBe(400);
  });

  it('GET /users/{id} → 200 just-created user', async () => {
    expect(createdId).toBeTruthy();
    const res = await get(app, token, `/users/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdId);
  });

  it('PATCH /users/{id} → 200 update', async () => {
    const res = await patch(app, token, `/users/${createdId}`, {
      full_name: 'Updated User',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.full_name).toBe('Updated User');
  });

  it('PATCH /users/{id}/toggle-active → 200 deactivate/activate', async () => {
    const off = await patch(app, token, `/users/${createdId}/toggle-active`, {
      is_active: false,
    });
    expect(off.status).toBe(200);
    expect(off.body.success).toBe(true);
    expect(off.body.data.is_active).toBe(false);

    const on = await patch(app, token, `/users/${createdId}/toggle-active`, {
      is_active: true,
    });
    expect(on.status).toBe(200);
    expect(on.body.data.is_active).toBe(true);
  });

  it('GET nonexistent id → 404', async () => {
    const res = await get(app, token, '/users/00000000-0000-0000-0000-0000000000ff');
    expect(res.status).toBe(404);
  });

  it('DELETE /users/{id} → 200 (soft delete)', async () => {
    const res = await del(app, token, `/users/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
