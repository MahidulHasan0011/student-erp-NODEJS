import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { RUN, uniq, connect, disconnect, get, post, patch, del } from './_helpers.js';

// pre-signed URL flow — generate-url is signed locally (without network), so it works
// even when MinIO/S3 is not running. Since confirm requires an S3 HEAD, confirm is not tested here.
describe.skipIf(!RUN)('Uploads API (integration)', () => {
  let app: Express;
  let token: string;
  let createdId: string; // upload_id created in the generate-url step

  beforeAll(async () => {
    ({ app, token } = await connect());
  });
  afterAll(async () => {
    await disconnect();
  });

  it('GET /uploads → 200 + list (array)', async () => {
    const res = await get(app, token, '/uploads');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('GET /uploads without token → 401', async () => {
    const res = await get(app, 'invalid-token', '/uploads');
    expect(res.status).toBe(401);
  });

  it('POST /uploads/generate-url → 201 + upload_id + uploadUrl (local sign, no MinIO)', async () => {
    const res = await post(app, token, '/uploads/generate-url', {
      original_name: `${uniq('test')}.png`,
      category: 'STUDENT_PROFILE',
      file_size: 2048,
      mime_type: 'image/png',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('upload_id');
    expect(res.body.data).toHaveProperty('uploadUrl');
    expect(typeof res.body.data.uploadUrl).toBe('string');
    createdId = res.body.data.upload_id;
  });

  it('POST /uploads/generate-url incomplete body → 400', async () => {
    const res = await post(app, token, '/uploads/generate-url', {
      original_name: 'x.png',
    });
    expect(res.status).toBe(400);
  });

  it('POST /uploads/generate-url disallowed type in category → 400', async () => {
    // STUDENT_PROFILE is IMAGE only; providing a pdf will be rejected by policy
    const res = await post(app, token, '/uploads/generate-url', {
      original_name: `${uniq('doc')}.pdf`,
      category: 'STUDENT_PROFILE',
      file_size: 2048,
      mime_type: 'application/pdf',
    });
    expect(res.status).toBe(400);
  });

  it('GET /uploads/{id} → 200 just-created upload', async () => {
    expect(createdId).toBeTruthy();
    const res = await get(app, token, `/uploads/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdId);
    expect(res.body.data.status).toBe('PENDING');
  });

  it('GET /uploads nonexistent id → 404', async () => {
    const res = await get(app, token, '/uploads/00000000-0000-0000-0000-0000000000ff');
    expect(res.status).toBe(404);
  });

  it('DELETE /uploads/{id} → 200 soft-delete', async () => {
    expect(createdId).toBeTruthy();
    const res = await del(app, token, `/uploads/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PATCH /uploads/{id}/restore → 200 restore', async () => {
    expect(createdId).toBeTruthy();
    const res = await patch(app, token, `/uploads/${createdId}/restore`, {});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(createdId);
  });

  it('clean up: DELETE /uploads/{id} soft-delete again', async () => {
    if (!createdId) return;
    const res = await del(app, token, `/uploads/${createdId}`);
    expect(res.status).toBe(200);
  });
});
