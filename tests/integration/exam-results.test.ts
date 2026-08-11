import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { RUN, SEED, uniq, connect, disconnect, get, post, patch, del } from './_helpers.js';

describe.skipIf(!RUN)('Exam-Results API (integration)', () => {
  let app: Express;
  let token: string;
  let examId: string; // fresh exam created for the test (to keep the triple unique)
  let resultId: string; // id of the created result

  beforeAll(async () => {
    ({ app, token } = await connect());
    // create a new exam to ensure a unique (exam_id, student_id, subject_id)
    const res = await post(app, token, '/exams', {
      name: uniq('ResultExam'),
      class_id: SEED.classes.c1,
      academic_session_id: SEED.sessions.active,
      exam_date: '2026-05-01',
      exam_type: 'UNIT_TEST',
    });
    examId = res.body?.data?.id;
  });

  afterAll(async () => {
    // self-clean: result first, then exam (a result blocks exam deletion)
    if (resultId) await del(app, token, `/results/${resultId}`);
    if (examId) await del(app, token, `/exams/${examId}`);
    await disconnect();
  });

  it('GET /results → 200 + paginated list', async () => {
    const res = await get(app, token, '/results');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('GET /results without token → 401', async () => {
    const res = await get(app, 'invalid-token', '/results');
    expect(res.status).toBe(401);
  });

  it('POST /results → 201 new result entry', async () => {
    expect(examId).toBeTruthy();
    const res = await post(app, token, '/results', {
      exam_id: examId,
      student_id: SEED.students.s1,
      subject_id: SEED.subjects.religion,
      marks: 77,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(Number(res.body.data.marks)).toBe(77);
    resultId = res.body.data.id;
  });

  it('POST /results duplicate triple → 409', async () => {
    const res = await post(app, token, '/results', {
      exam_id: examId,
      student_id: SEED.students.s1,
      subject_id: SEED.subjects.religion,
      marks: 80,
    });
    expect(res.status).toBe(409);
  });

  it('POST /results incomplete body → 400', async () => {
    const res = await post(app, token, '/results', { exam_id: examId });
    expect(res.status).toBe(400);
  });

  it('GET /results/{id} → 200 just-created result', async () => {
    expect(resultId).toBeTruthy();
    const res = await get(app, token, `/results/${resultId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(resultId);
  });

  it('GET nonexistent id → 404', async () => {
    const res = await get(app, token, '/results/00000000-0000-0000-0000-0000000000ff');
    expect(res.status).toBe(404);
  });

  it('PATCH /results/{id} → 200 marks update', async () => {
    const res = await patch(app, token, `/results/${resultId}`, { marks: 88 });
    expect(res.status).toBe(200);
    expect(Number(res.body.data.marks)).toBe(88);
  });

  it('GET /results/exam/{examId} → 200 array', async () => {
    const res = await get(app, token, `/results/exam/${examId}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /results/exam/{examId} nonexistent exam → 404', async () => {
    const res = await get(app, token, '/results/exam/00000000-0000-0000-0000-0000000000ff');
    expect(res.status).toBe(404);
  });

  it('GET marksheet (seeded exam + student) → 200', async () => {
    const res = await get(
      app,
      token,
      `/results/exam/${SEED.exams.midterm1}/student/${SEED.students.s1}/marksheet`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('results');
    expect(res.body.data).toHaveProperty('total_marks');
    expect(Array.isArray(res.body.data.results)).toBe(true);
  });

  it('DELETE /results/{id} → 200', async () => {
    const res = await del(app, token, `/results/${resultId}`);
    expect(res.status).toBe(200);
    resultId = null;
  });
});
