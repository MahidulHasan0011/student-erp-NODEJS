import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { RUN, SEED, uniq, connect, disconnect, get, post, patch, del } from './_helpers.js';

describe.skipIf(!RUN)('Exams API (integration)', () => {
  let app: Express;
  let token: string;
  let createdId: string | null; // id of the exam created during the lifecycle

  beforeAll(async () => {
    ({ app, token } = await connect());
  });
  afterAll(async () => {
    await disconnect();
  });

  it('GET /exams → 200 + paginated list', async () => {
    const res = await get(app, token, '/exams');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('GET /exams without token → 401', async () => {
    const res = await get(app, 'invalid-token', '/exams');
    expect(res.status).toBe(401);
  });

  it('POST /exams → 201 create new exam (DRAFT)', async () => {
    const res = await post(app, token, '/exams', {
      name: uniq('Exam'),
      class_id: SEED.classes.c2,
      academic_session_id: SEED.sessions.active,
      exam_date: '2026-03-01',
      exam_type: 'MIDTERM',
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.exam_type).toBe('MIDTERM');
    createdId = res.body.data.id;
  });

  it('POST /exams without name → 400', async () => {
    const res = await post(app, token, '/exams', { exam_type: 'MIDTERM' });
    expect(res.status).toBe(400);
  });

  it('GET /exams/{id} → 200 just-created exam', async () => {
    expect(createdId).toBeTruthy();
    const res = await get(app, token, `/exams/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdId);
  });

  it('GET nonexistent id → 404', async () => {
    const res = await get(app, token, '/exams/00000000-0000-0000-0000-0000000000ff');
    expect(res.status).toBe(404);
  });

  it('PATCH /exams/{id} → 200 update', async () => {
    const res = await patch(app, token, `/exams/${createdId}`, {
      exam_date: '2026-04-01',
      exam_type: 'UNIT_TEST',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.exam_type).toBe('UNIT_TEST');
  });

  it('PATCH /exams/{id}/publish without result → 400', async () => {
    // the just-created exam has no result, so publish will be blocked
    const res = await patch(app, token, `/exams/${createdId}/publish`);
    expect(res.status).toBe(400);
  });

  it('PATCH /exams/{id}/unpublish already DRAFT → 400', async () => {
    const res = await patch(app, token, `/exams/${createdId}/unpublish`);
    expect(res.status).toBe(400);
  });

  it('DELETE /exams/{id} → 200 (deletes because it has no result)', async () => {
    const res = await del(app, token, `/exams/${createdId}`);
    expect(res.status).toBe(200);
    createdId = null;
  });
});
