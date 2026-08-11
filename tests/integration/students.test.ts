import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { RUN, SEED, uniq, connect, disconnect, get, post, patch, del } from './_helpers.js';

// template file — the rest of the module tests follow this pattern.
describe.skipIf(!RUN)('Students API (integration)', () => {
  let app: Express;
  let token: string;
  let createdId: string; // id of the student created across the lifecycle

  beforeAll(async () => {
    ({ app, token } = await connect());
  });
  afterAll(async () => {
    await disconnect();
  });

  it('GET /students → 200 + paginated list', async () => {
    const res = await get(app, token, '/students');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('GET /students without token → 401', async () => {
    const res = await get(app, 'invalid-token', '/students');
    expect(res.status).toBe(401);
  });

  it('POST /students → 201 create new student', async () => {
    const email = `${uniq('student')}@test.school.com`;
    const res = await post(app, token, '/students', {
      full_name: 'Test Student',
      email,
      password: 'Password@123',
      gender: 'MALE',
      date_of_birth: '2015-05-10',
      guardian_name: 'Test Guardian',
      guardian_phone: '01700000000',
      address: 'Test Address, Dhaka',
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.student_code).toMatch(/^STU-/);
    createdId = res.body.data.id;
  });

  it('POST /students duplicate email → 409', async () => {
    const email = `${uniq('dup')}@test.school.com`;
    const body = { full_name: 'Dup', email, password: 'Password@123' };
    await post(app, token, '/students', body);
    const res = await post(app, token, '/students', body);
    expect(res.status).toBe(409);
  });

  it('POST /students incomplete body → 400', async () => {
    const res = await post(app, token, '/students', { full_name: 'No Email' });
    expect(res.status).toBe(400);
  });

  it('GET /students/{id} → 200 just-created student', async () => {
    expect(createdId).toBeTruthy();
    const res = await get(app, token, `/students/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdId);
  });

  it('GET /students/{id}/enrollment → 200 (enrollment may be null)', async () => {
    const res = await get(app, token, `/students/${SEED.students.s1}/enrollment`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('current_enrollment');
  });

  it('PATCH /students/{id} → 200 update', async () => {
    const res = await patch(app, token, `/students/${createdId}`, {
      guardian_name: 'Updated Guardian',
      address: 'Updated Address',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.guardian_name).toBe('Updated Guardian');
  });

  it('GET nonexistent id → 404', async () => {
    const res = await get(app, token, '/students/00000000-0000-0000-0000-0000000000ff');
    expect(res.status).toBe(404);
  });

  it('DELETE /students/{id} → 200 (deletes because there is no enrollment)', async () => {
    const res = await del(app, token, `/students/${createdId}`);
    expect(res.status).toBe(200);
  });
});
