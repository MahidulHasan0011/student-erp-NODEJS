import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { RUN, SEED, uniq, connect, disconnect, get, post, patch, del } from './_helpers.js';

// unique constraint: (student_id, academic_session_id) — this is a hard UNIQUE (does not exclude soft-deletes).
// So inserting the fixed combo a second time would clash. To keep it re-runnable, in beforeAll we create a
// FRESH session and enroll s1 into it — the combo is always new on every run.
// class c1 has sections (seed: c1-A, c1-B), so section_id is required — we use c1a.

describe.skipIf(!RUN)('Student-Enrollments API (integration)', () => {
  let app: Express;
  let token: string;
  let createdId: string; // id of the enrollment created across the lifecycle
  let sessionId: string; // fresh academic session created for this suite

  beforeAll(async () => {
    ({ app, token } = await connect());
    // fresh session — to ensure unique (student, session)
    const res = await post(app, token, '/academic-sessions', {
      name: uniq('ENROLL_SESSION'),
      start_date: '2030-01-01',
      end_date: '2030-12-31',
    });
    sessionId = res.body?.data?.id;
  });
  afterAll(async () => {
    // cleanup: enrollment → session (if present), ignore errors
    if (createdId) await del(app, token, `/enrollments/${createdId}`);
    if (sessionId) await del(app, token, `/academic-sessions/${sessionId}`);
    await disconnect();
  });

  it('GET /enrollments → 200 + paginated list', async () => {
    const res = await get(app, token, '/enrollments');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('GET /enrollments without token → 401', async () => {
    const res = await get(app, 'invalid-token', '/enrollments');
    expect(res.status).toBe(401);
  });

  it('POST /enrollments → 201 create new enrollment (s1 → s2324)', async () => {
    const res = await post(app, token, '/enrollments', {
      student_id: SEED.students.s1,
      class_id: SEED.classes.c1,
      section_id: SEED.sections.c1a,
      academic_session_id: sessionId,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    createdId = res.body.data.id;
  });

  it('POST /enrollments same student+session → 409', async () => {
    const res = await post(app, token, '/enrollments', {
      student_id: SEED.students.s1,
      class_id: SEED.classes.c1,
      section_id: SEED.sections.c1a,
      academic_session_id: sessionId,
    });
    expect(res.status).toBe(409);
  });

  it('POST /enrollments incomplete body → 400', async () => {
    const res = await post(app, token, '/enrollments', { student_id: SEED.students.s1 });
    expect(res.status).toBe(400);
  });

  it('GET /enrollments/{id} → 200 just-created enrollment', async () => {
    expect(createdId).toBeTruthy();
    const res = await get(app, token, `/enrollments/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdId);
  });

  it('GET nonexistent id → 404', async () => {
    const res = await get(app, token, '/enrollments/00000000-0000-0000-0000-0000000000ff');
    expect(res.status).toBe(404);
  });

  it('PATCH /enrollments/{id} → 200 update (section transfer c1a → c1b)', async () => {
    const res = await patch(app, token, `/enrollments/${createdId}`, {
      class_id: SEED.classes.c1,
      section_id: SEED.sections.c1b,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdId);
  });

  it('DELETE /enrollments/{id} → 200 (admin has ENROLLMENT_UPDATE permission)', async () => {
    const res = await del(app, token, `/enrollments/${createdId}`);
    expect(res.status).toBe(200);
  });
});
