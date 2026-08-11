import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { RUN, SEED, uniq, connect, disconnect, get, post, patch, del } from './_helpers.js';

describe.skipIf(!RUN)('Teachers API (integration)', () => {
  let app: Express;
  let token: string;
  let createdId: string; // id of the teacher created across the lifecycle

  beforeAll(async () => {
    ({ app, token } = await connect());
  });
  afterAll(async () => {
    await disconnect();
  });

  it('GET /teachers → 200 + paginated list', async () => {
    const res = await get(app, token, '/teachers');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('GET /teachers without token → 401', async () => {
    const res = await get(app, 'invalid-token', '/teachers');
    expect(res.status).toBe(401);
  });

  it('POST /teachers → 201 create new teacher', async () => {
    const email = `${uniq('teacher')}@test.school.com`;
    const res = await post(app, token, '/teachers', {
      full_name: 'Test Teacher',
      email,
      password: 'Password@123',
      gender: 'MALE',
      phone: '01700000000',
      designation: 'Senior Teacher',
      qualification: 'M.Sc in Mathematics',
      joining_date: '2020-01-15',
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    createdId = res.body.data.id;
  });

  it('POST /teachers duplicate email → 409', async () => {
    const email = `${uniq('dup')}@test.school.com`;
    const body = { full_name: 'Dup Teacher', email, password: 'Password@123' };
    await post(app, token, '/teachers', body);
    const res = await post(app, token, '/teachers', body);
    expect(res.status).toBe(409);
  });

  it('POST /teachers incomplete body → 400', async () => {
    const res = await post(app, token, '/teachers', { full_name: 'No Email' });
    expect(res.status).toBe(400);
  });

  it('GET /teachers/{id} → 200 just-created teacher', async () => {
    expect(createdId).toBeTruthy();
    const res = await get(app, token, `/teachers/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdId);
  });

  it('GET /teachers/{id}/assignments → 200 (profile + assignments)', async () => {
    const res = await get(app, token, `/teachers/${SEED.teachers.t1}/assignments`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.assignments)).toBe(true);
  });

  it('PATCH /teachers/{id} → 200 update', async () => {
    const res = await patch(app, token, `/teachers/${createdId}`, {
      designation: 'Head Teacher',
      qualification: 'Ph.D in Education',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.designation).toBe('Head Teacher');
  });

  it('GET nonexistent id → 404', async () => {
    const res = await get(app, token, '/teachers/00000000-0000-0000-0000-0000000000ff');
    expect(res.status).toBe(404);
  });

  it('DELETE /teachers/{id} → 200 (deletes because there is no assignment)', async () => {
    const res = await del(app, token, `/teachers/${createdId}`);
    expect(res.status).toBe(200);
  });
});
