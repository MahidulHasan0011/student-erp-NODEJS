import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { RUN, SEED, uniq, connect, disconnect, get, post, patch, del } from './_helpers.js';

// class c2 has sections (seed: c2-A, c2-B), so section_id is required when creating an assignment.
// seeded UUID of the c2-A section — not exposed by name in SEED.sections, so we use it directly.
const SECTION_C2_A = 'e0000000-0000-0000-0000-000000000003';

// unique constraint (teacher,class,section,subject,session) is hard UNIQUE (does not exclude soft-deletes).
// To keep it re-runnable, in beforeAll we create two FRESH subjects — both the create and patch combos
// get a new subject on every run, so there is no clash with an old soft-deleted row.
describe.skipIf(!RUN)('Subject-Assignments API (integration)', () => {
  let app: Express;
  let token: string;
  let createdId: string; // id of the assignment created across the lifecycle
  let subjectA: string;
  let subjectB: string; // fresh subjects for this suite (create + patch)

  beforeAll(async () => {
    ({ app, token } = await connect());
    const a = await post(app, token, '/subjects', { name: uniq('SA_SUBJ'), code: uniq('SAA') });
    const b = await post(app, token, '/subjects', { name: uniq('SA_SUBJ'), code: uniq('SAB') });
    subjectA = a.body?.data?.id;
    subjectB = b.body?.data?.id;
  });
  afterAll(async () => {
    // cleanup: assignment → subjects (once the assignment is soft-deleted, subject deletion is not blocked)
    if (createdId) await del(app, token, `/assignments/${createdId}`);
    if (subjectA) await del(app, token, `/subjects/${subjectA}`);
    if (subjectB) await del(app, token, `/subjects/${subjectB}`);
    await disconnect();
  });

  it('GET /assignments → 200 + paginated list', async () => {
    const res = await get(app, token, '/assignments');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('GET /assignments without token → 401', async () => {
    const res = await get(app, 'invalid-token', '/assignments');
    expect(res.status).toBe(401);
  });

  it('POST /assignments → 201 create new assignment (combo not in seed)', async () => {
    const res = await post(app, token, '/assignments', {
      teacher_id: SEED.teachers.t2,
      class_id: SEED.classes.c2,
      section_id: SECTION_C2_A,
      subject_id: subjectA,
      academic_session_id: SEED.sessions.active,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    createdId = res.body.data.id;
  });

  it('POST /assignments duplicate combo → 409', async () => {
    const res = await post(app, token, '/assignments', {
      teacher_id: SEED.teachers.t2,
      class_id: SEED.classes.c2,
      section_id: SECTION_C2_A,
      subject_id: subjectA,
      academic_session_id: SEED.sessions.active,
    });
    expect(res.status).toBe(409);
  });

  it('POST /assignments incomplete body → 400', async () => {
    const res = await post(app, token, '/assignments', { teacher_id: SEED.teachers.t2 });
    expect(res.status).toBe(400);
  });

  it('GET /assignments/{id} → 200 just-created assignment', async () => {
    expect(createdId).toBeTruthy();
    const res = await get(app, token, `/assignments/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdId);
  });

  it('GET /assignments/teacher/{teacherId} → 200 array (seeded teacher t1)', async () => {
    const res = await get(app, token, `/assignments/teacher/${SEED.teachers.t1}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET nonexistent id → 404', async () => {
    const res = await get(app, token, '/assignments/00000000-0000-0000-0000-0000000000ff');
    expect(res.status).toBe(404);
  });

  it('PATCH /assignments/{id} → 200 update (subject reassign)', async () => {
    const res = await patch(app, token, `/assignments/${createdId}`, {
      subject_id: subjectB,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdId);
  });

  it('DELETE /assignments/{id} → 200 (soft delete)', async () => {
    const res = await del(app, token, `/assignments/${createdId}`);
    expect(res.status).toBe(200);
  });
});
