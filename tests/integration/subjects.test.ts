import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { RUN, uniq, connect, disconnect, get, post, patch, del } from './_helpers.js';

describe.skipIf(!RUN)('Subjects API (integration)', () => {
  let app: Express;
  let token: string;
  let createdId: string; // id of the subject created across the lifecycle

  beforeAll(async () => {
    ({ app, token } = await connect());
  });
  afterAll(async () => {
    await disconnect();
  });

  it('GET /subjects → 200 + paginated list', async () => {
    const res = await get(app, token, '/subjects');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('GET /subjects without token → 401', async () => {
    const res = await get(app, 'invalid-token', '/subjects');
    expect(res.status).toBe(401);
  });

  it('POST /subjects → 201 create new subject', async () => {
    const res = await post(app, token, '/subjects', {
      name: uniq('Subject'),
      code: uniq('SC'),
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    createdId = res.body.data.id;
  });

  it('POST /subjects duplicate code → 409', async () => {
    const code = uniq('SC');
    await post(app, token, '/subjects', { name: uniq('Subject'), code });
    const res = await post(app, token, '/subjects', { name: uniq('Subject'), code });
    expect(res.status).toBe(409);
  });

  it('POST /subjects incomplete body → 400', async () => {
    const res = await post(app, token, '/subjects', { code: uniq('SC') });
    expect(res.status).toBe(400);
  });

  it('GET /subjects/{id} → 200 just-created subject', async () => {
    expect(createdId).toBeTruthy();
    const res = await get(app, token, `/subjects/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdId);
  });

  it('PATCH /subjects/{id} → 200 update', async () => {
    const newName = uniq('Subject');
    const res = await patch(app, token, `/subjects/${createdId}`, { name: newName });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe(newName);
  });

  it('GET nonexistent id → 404', async () => {
    const res = await get(app, token, '/subjects/00000000-0000-0000-0000-0000000000ff');
    expect(res.status).toBe(404);
  });

  it('DELETE /subjects/{id} → 200 (deletes because it is unassigned)', async () => {
    const res = await del(app, token, `/subjects/${createdId}`);
    expect(res.status).toBe(200);
  });
});
