import { Router } from 'express';
import { uploadController } from './upload.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rbacMiddleware } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authMiddleware); // all routes require JWT

// ── write/confirm ──
/**
 * @openapi
 * /uploads/generate-url:
 *   post:
 *     tags: [Uploads]
 *     summary: Step 1 — create a pre-signed PUT URL (requires UPLOAD_CREATE permission)
 *     description: >
 *       Validates the declared metadata, creates a PENDING upload row, and returns a
 *       short-lived pre-signed URL for PUTting directly to S3/MinIO. The frontend PUTs the file
 *       to this URL, then calls `POST /uploads/confirm`. extension+MIME consistency, category
 *       policy and size limit are all checked here. Required permission — UPLOAD_CREATE.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [original_name, category, file_size, mime_type]
 *             properties:
 *               original_name:
 *                 type: string
 *                 maxLength: 255
 *                 description: original file name including the extension
 *                 example: profile.png
 *               category:
 *                 type: string
 *                 enum: [STUDENT_PROFILE, TEACHER_PROFILE, SCHOOL_LOGO, ASSIGNMENT, QUESTION_PAPER, ANSWER_SHEET, EXAM_ATTACHMENT, LEAVE_ATTACHMENT, ATTENDANCE_PROOF, CERTIFICATE, NOTICE_ATTACHMENT, OTHER]
 *                 example: STUDENT_PROFILE
 *               file_size:
 *                 type: integer
 *                 minimum: 1
 *                 description: declared byte size (the actual size is re-verified on confirm)
 *                 example: 204800
 *               mime_type:
 *                 type: string
 *                 maxLength: 127
 *                 example: image/png
 *               related_type:
 *                 type: string
 *                 maxLength: 50
 *                 description: optional polymorphic link type
 *                 example: STUDENT
 *               related_id:
 *                 type: string
 *                 format: uuid
 *                 description: optional polymorphic link id
 *     responses:
 *       201:
 *         description: upload URL created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/UploadUrlResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/generate-url', rbacMiddleware('UPLOAD_CREATE'), uploadController.generateUrl);
/**
 * @openapi
 * /uploads/confirm:
 *   post:
 *     tags: [Uploads]
 *     summary: Step 2 — confirm the upload (requires UPLOAD_CREATE permission)
 *     description: >
 *       Verifies the object exists in storage and is within the actual size limit, then moves
 *       status PENDING → READY. Idempotent — if already READY, returns that same row. If oversize,
 *       purges the object, marks it FAILED and returns 400. Required permission — UPLOAD_CREATE.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [upload_id]
 *             properties:
 *               upload_id:
 *                 type: string
 *                 format: uuid
 *                 description: the upload_id returned by the generate-url step
 *               checksum:
 *                 type: string
 *                 maxLength: 128
 *                 description: optional — client-computed checksum (if omitted, the storage etag is used)
 *     responses:
 *       200:
 *         description: upload confirmed (READY upload record)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Upload' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/confirm', rbacMiddleware('UPLOAD_CREATE'), uploadController.confirm);
/**
 * @openapi
 * /uploads/bulk-delete:
 *   post:
 *     tags: [Uploads]
 *     summary: soft-delete multiple files at once (requires UPLOAD_DELETE permission)
 *     description: >
 *       Checks each id's ownership separately and soft-deletes it; reports partial success
 *       (which were deleted and which were skipped). Required permission — UPLOAD_DELETE.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: bulk delete processed
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         deleted:
 *                           type: array
 *                           items: { type: string, format: uuid }
 *                         skipped:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id: { type: string, format: uuid }
 *                               reason: { type: string }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/bulk-delete', rbacMiddleware('UPLOAD_DELETE'), uploadController.bulkDelete);

// ── read ── (static first, then param)
/**
 * @openapi
 * /uploads:
 *   get:
 *     tags: [Uploads]
 *     summary: list uploads (requires UPLOAD_READ permission)
 *     description: >
 *       Paginated list of uploads. Without UPLOAD_MANAGE, a user only sees their own files
 *       (the uploaded_by filter is overridden). Required permission — UPLOAD_READ.
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - name: category
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [STUDENT_PROFILE, TEACHER_PROFILE, SCHOOL_LOGO, ASSIGNMENT, QUESTION_PAPER, ANSWER_SHEET, EXAM_ATTACHMENT, LEAVE_ATTACHMENT, ATTENDANCE_PROOF, CERTIFICATE, NOTICE_ATTACHMENT, OTHER]
 *       - name: status
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [PENDING, READY, FAILED] }
 *       - name: uploaded_by
 *         in: query
 *         required: false
 *         schema: { type: string, format: uuid }
 *       - name: related_type
 *         in: query
 *         required: false
 *         schema: { type: string, maxLength: 50 }
 *       - name: related_id
 *         in: query
 *         required: false
 *         schema: { type: string, format: uuid }
 *       - name: search
 *         in: query
 *         required: false
 *         schema: { type: string, maxLength: 255 }
 *     responses:
 *       200:
 *         description: file list
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Upload' }
 *                     meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', rbacMiddleware('UPLOAD_READ'), uploadController.getAll);
/**
 * @openapi
 * /uploads/{id}:
 *   get:
 *     tags: [Uploads]
 *     summary: details of a single upload (requires UPLOAD_READ permission)
 *     description: >
 *       Only the owner or a user with UPLOAD_MANAGE can view it — otherwise 403. Required permission — UPLOAD_READ.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: file information
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Upload' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', rbacMiddleware('UPLOAD_READ'), uploadController.getById);
/**
 * @openapi
 * /uploads/{id}/download:
 *   get:
 *     tags: [Uploads]
 *     summary: pre-signed GET URL for download (requires UPLOAD_READ permission)
 *     description: >
 *       Returns a short-lived pre-signed GET URL for a READY file. If the file is not READY, 409.
 *       No access without owner or UPLOAD_MANAGE (403). Required permission — UPLOAD_READ.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: download URL created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         url: { type: string }
 *                         expiresIn: { type: integer, description: URL TTL (seconds) }
 *                         original_name: { type: string }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.get('/:id/download', rbacMiddleware('UPLOAD_READ'), uploadController.download);

// ── delete/restore ──
/**
 * @openapi
 * /uploads/{id}:
 *   delete:
 *     tags: [Uploads]
 *     summary: soft-delete a file (requires UPLOAD_DELETE permission)
 *     description: >
 *       Only the owner or a user with UPLOAD_MANAGE can delete it. Required permission — UPLOAD_DELETE.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: file deleted
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:id', rbacMiddleware('UPLOAD_DELETE'), uploadController.delete);
/**
 * @openapi
 * /uploads/{id}/restore:
 *   patch:
 *     tags: [Uploads]
 *     summary: restore a soft-deleted file (requires UPLOAD_RESTORE permission)
 *     description: >
 *       Restores a file that has deleted_at set. If the file is not deleted, 400.
 *       No access without owner or UPLOAD_MANAGE (403). Required permission — UPLOAD_RESTORE.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: file restored
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Upload' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:id/restore', rbacMiddleware('UPLOAD_RESTORE'), uploadController.restore);

export default router;
