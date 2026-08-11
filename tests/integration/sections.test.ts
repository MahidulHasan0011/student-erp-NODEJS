import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { RUN, SEED, uniq, connect, disconnect, get, post, patch, del } from './_helpers.js';

describe.skipIf(!RUN)('Sections API (integration)', () => {
  let app: Express;
  let token: string;
  let createdId: string; // id of the section created during the lifecycle

  beforeAll(async () => {
    ({ app, token } = await connect());
  });
  afterAll(async () => {
    await disconnect();
  });

  it('GET /sections → 200 + paginated list', async () => {
    const res = await get(app, token, '/sections');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('GET /sections without token → 401', async () => {
    const res = await get(app, 'invalid-token', '/sections');
    expect(res.status).toBe(401);
  });

  it('POST /sections → 201 create new section', async () => {
    const res = await post(app, token, '/sections', {
      class_id: SEED.classes.c1,
      name: uniq('S'),
      max_capacity: 40,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    createdId = res.body.data.id;
  });

  it('POST /sections duplicate name (same class) → 409', async () => {
    const name = uniq('S');
    const body = { class_id: SEED.classes.c1, name, max_capacity: 30 };
    await post(app, token, '/sections', body);
    const res = await post(app, token, '/sections', body);
    expect(res.status).toBe(409);
  });

  it('POST /sections incomplete body → 400', async () => {
    const res = await post(app, token, '/sections', { name: uniq('S') });
    expect(res.status).toBe(400);
  });

  it('GET /sections/{id} → 200 just-created section', async () => {
    expect(createdId).toBeTruthy();
    const res = await get(app, token, `/sections/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdId);
  });

  it('GET /sections/{id}/occupancy → 200', async () => {
    const res = await get(app, token, `/sections/${SEED.sections.c1a}/occupancy`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('enrolled_count');
    expect(res.body.data).toHaveProperty('is_full');
  });

  it('PATCH /sections/{id} → 200 update', async () => {
    const res = await patch(app, token, `/sections/${createdId}`, { max_capacity: 45 });
    expect(res.status).toBe(200);
    expect(res.body.data.max_capacity).toBe(45);
  });

  it('GET nonexistent id → 404', async () => {
    const res = await get(app, token, '/sections/00000000-0000-0000-0000-0000000000ff');
    expect(res.status).toBe(404);
  });

  it('DELETE /sections/{id} → 200 (deletes because there is no enrollment)', async () => {
    const res = await del(app, token, `/sections/${createdId}`);
    expect(res.status).toBe(200);
  });
});
