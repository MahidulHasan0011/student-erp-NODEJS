import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { RUN, SEED, uniq, connect, disconnect, get, post, patch, del } from './_helpers.js';

describe.skipIf(!RUN)('Classes API (integration)', () => {
  let app: Express;
  let token: string;
  let createdId: string; // id of the class created during the lifecycle

  beforeAll(async () => {
    ({ app, token } = await connect());
  });
  afterAll(async () => {
    await disconnect();
  });

  it('GET /classes → 200 + paginated list', async () => {
    const res = await get(app, token, '/classes');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('GET /classes without token → 401', async () => {
    const res = await get(app, 'invalid-token', '/classes');
    expect(res.status).toBe(401);
  });

  it('POST /classes → 201 create new class', async () => {
    const res = await post(app, token, '/classes', { name: uniq('Class') });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    createdId = res.body.data.id;
  });

  it('POST /classes duplicate name → 409', async () => {
    const name = uniq('Class');
    await post(app, token, '/classes', { name });
    const res = await post(app, token, '/classes', { name });
    expect(res.status).toBe(409);
  });

  it('POST /classes incomplete body → 400', async () => {
    const res = await post(app, token, '/classes', {});
    expect(res.status).toBe(400);
  });

  it('GET /classes/{id} → 200 just-created class', async () => {
    expect(createdId).toBeTruthy();
    const res = await get(app, token, `/classes/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdId);
  });

  it('GET /classes/{id}/sections → 200 array', async () => {
    const res = await get(app, token, `/classes/${SEED.classes.c1}/sections`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.sections)).toBe(true);
  });

  it('PATCH /classes/{id} → 200 update', async () => {
    const newName = uniq('Class');
    const res = await patch(app, token, `/classes/${createdId}`, { name: newName });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe(newName);
  });

  it('GET nonexistent id → 404', async () => {
    const res = await get(app, token, '/classes/00000000-0000-0000-0000-0000000000ff');
    expect(res.status).toBe(404);
  });

  it('DELETE /classes/{id} → 200 (deletes because it has no sections)', async () => {
    const res = await del(app, token, `/classes/${createdId}`);
    expect(res.status).toBe(200);
  });
});
