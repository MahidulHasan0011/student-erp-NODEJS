import { uploadRepository } from './upload.repository.js';
import { storageService } from '../../services/storage.service.js';
import { AppError } from '../../utils/appError.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { env } from '../../config/env.js';
import {
  UPLOAD_STATUS,
  AUDIT_ACTIONS,
  buildStorageKey,
  resolveFileType,
} from './upload.constants.js';
import type { ConfirmInput, GenerateUrlInput } from './upload.validation.js';
import type { ListQuery, Paginated } from '../../types/common.types.js';
import type { UploadRow } from '../../types/db.types.js';

/** Who is acting — assembled by the controller from req.user + req.permissions. */
export interface UploadActor {
  userId: string;
  roleId?: string | null;
  /** set by rbacMiddleware; absent on routes that skip it */
  permissions?: string[];
}

/** Where the action came from — recorded in the audit trail. */
export interface AuditContext {
  ip?: string;
  userAgent?: string;
}

/** An upload as returned to a client — storage_key is internal and always stripped. */
export type SafeUpload = Omit<UploadRow, 'storage_key'>;

export interface GenerateUrlResult {
  upload_id: string;
  method: 'PUT';
  uploadUrl: string;
  headers: Record<string, string>;
  expiresIn: number;
  storage_key: string;
}

export interface DownloadUrlResult {
  url: string;
  expiresIn: number;
  original_name: string;
}

export interface BulkDeleteResult {
  deleted: string[];
  skipped: { id: string; reason: string }[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

// with UPLOAD_MANAGE a user can view/delete other users' files too (admin override)
const hasManage = (actor: UploadActor): boolean =>
  Array.isArray(actor?.permissions) && actor.permissions.includes('UPLOAD_MANAGE');

// must be the owner, otherwise have manage permission — neither means 403
const assertCanAccess = (row: UploadRow, actor: UploadActor): void => {
  if (row.uploaded_by === actor.userId || hasManage(actor)) return;
  throw new AppError('You do not have access to this file', 403);
};

// never expose storage_key externally (internal); return everything else
function sanitize(row: UploadRow): SafeUpload;
function sanitize(row: UploadRow | null): SafeUpload | null;
function sanitize(row: UploadRow | null): SafeUpload | null {
  if (!row) return row;
  const { storage_key, ...safe } = row;
  void storage_key;
  return safe;
}

export const uploadService = {
  /**
   * step 1 — presigned PUT URL. we only create a PENDING metadata row;
   * the actual file is sent by the frontend directly to S3/R2. (input already normalized in validation)
   */
  async generateUploadUrl(
    input: GenerateUrlInput,
    actor: UploadActor,
    ctx: AuditContext = {},
  ): Promise<GenerateUrlResult> {
    const storage_key = buildStorageKey({
      category: input.category,
      uploadedBy: actor.userId,
      ext: input.extension,
    });

    const row = await uploadRepository.create({
      storage_key,
      original_name: input.original_name,
      mime_type: input.mime_type,
      extension: input.extension,
      file_size: input.file_size, // declared; verified on confirm
      category: input.category,
      uploaded_by: actor.userId,
      related_type: input.related_type,
      related_id: input.related_id,
    });

    const uploadUrl = await storageService.getUploadUrl({
      key: storage_key,
      contentType: input.mime_type,
    });

    await uploadRepository.insertAudit({
      upload_id: row.id,
      action: AUDIT_ACTIONS.GENERATE_URL,
      actor_id: actor.userId,
      ip_address: ctx.ip,
      user_agent: ctx.userAgent,
      detail: { category: input.category, declared_size: input.file_size },
    });

    return {
      upload_id: row.id,
      method: 'PUT',
      uploadUrl,
      // the frontend must PUT with exactly this header (ContentType is signed)
      headers: { 'Content-Type': input.mime_type },
      expiresIn: env.STORAGE_UPLOAD_URL_TTL,
      storage_key,
    };
  },

  /**
   * step 2 — confirm. verifies the object exists in S3 + checks the actual size, then PENDING→READY.
   * idempotent: if already READY, returns that same row.
   */
  async confirmUpload(
    { upload_id, checksum }: ConfirmInput,
    actor: UploadActor,
    ctx: AuditContext = {},
  ): Promise<SafeUpload | null> {
    const row = await uploadRepository.findById(upload_id);
    if (!row) throw new AppError('Upload not found', 404);
    assertCanAccess(row, actor);

    if (row.status === UPLOAD_STATUS.READY) return sanitize(row); // already confirmed

    const head = await storageService.headObject(row.storage_key);
    if (!head) {
      await uploadRepository.markFailed(row.id);
      throw new AppError('File was not found in storage — upload may have failed', 400);
    }

    // check the actual size is within the limit (we don't trust the client's declared size)
    const resolved = resolveFileType(row.extension, row.mime_type);
    if (resolved && head.contentLength > resolved.maxBytes) {
      await storageService.deleteObject(row.storage_key); // purge oversize file
      await uploadRepository.markFailed(row.id);
      const limitMb = Math.round(resolved.maxBytes / (1024 * 1024));
      throw new AppError(`Uploaded file exceeds the ${limitMb}MB limit`, 400);
    }

    const ready = await uploadRepository.markReady(row.id, {
      file_size: head.contentLength || row.file_size,
      checksum: checksum || head.etag,
      metadata: { etag: head.etag, verified_at: new Date().toISOString() },
    });

    await uploadRepository.insertAudit({
      upload_id: row.id,
      action: AUDIT_ACTIONS.CONFIRM,
      actor_id: actor.userId,
      ip_address: ctx.ip,
      user_agent: ctx.userAgent,
      detail: { actual_size: head.contentLength },
    });

    return sanitize(ready);
  },

  /** list — a non-manage user only sees their own files (ownership scope is enforced). */
  async list(filters: ListQuery, actor: UploadActor): Promise<Paginated<SafeUpload>> {
    const queryOptions: ListQuery = { ...filters };
    if (!hasManage(actor)) {
      queryOptions.uploaded_by = actor.userId; // override — another user's uploaded_by filter won't apply
    }

    const { page, limit, offset } = getPagination(filters);
    const [rows, total] = await Promise.all([
      uploadRepository.findAll(queryOptions, { limit, offset }),
      uploadRepository.countAll(queryOptions),
    ]);
    return { data: rows.map((r) => sanitize(r)), meta: buildMeta({ total, page, limit }) };
  },

  async getById(id: string, actor: UploadActor): Promise<SafeUpload> {
    const row = await uploadRepository.findById(id);
    if (!row) throw new AppError('Upload not found', 404);
    assertCanAccess(row, actor);
    return sanitize(row);
  },

  /** secure download — short-lived presigned GET URL (not CDN/stream, directly from storage). */
  async getDownloadUrl(
    id: string,
    actor: UploadActor,
    ctx: AuditContext = {},
  ): Promise<DownloadUrlResult> {
    const row = await uploadRepository.findById(id);
    if (!row) throw new AppError('Upload not found', 404);
    assertCanAccess(row, actor);
    if (row.status !== UPLOAD_STATUS.READY) {
      throw new AppError('File is not ready for download', 409);
    }

    const url = await storageService.getDownloadUrl({
      key: row.storage_key,
      downloadName: row.original_name,
    });

    await uploadRepository.insertAudit({
      upload_id: row.id,
      action: AUDIT_ACTIONS.DOWNLOAD,
      actor_id: actor.userId,
      ip_address: ctx.ip,
      user_agent: ctx.userAgent,
      detail: {},
    });

    return { url, expiresIn: env.STORAGE_DOWNLOAD_URL_TTL, original_name: row.original_name };
  },

  async softDelete(
    id: string,
    actor: UploadActor,
    ctx: AuditContext = {},
  ): Promise<{ id: string }> {
    const row = await uploadRepository.findById(id);
    if (!row) throw new AppError('Upload not found', 404);
    assertCanAccess(row, actor);

    await uploadRepository.softDelete(id);
    await uploadRepository.insertAudit({
      upload_id: id,
      action: AUDIT_ACTIONS.DELETE,
      actor_id: actor.userId,
      ip_address: ctx.ip,
      user_agent: ctx.userAgent,
      detail: {},
    });
    return { id };
  },

  async restore(
    id: string,
    actor: UploadActor,
    ctx: AuditContext = {},
  ): Promise<SafeUpload | null> {
    const row = await uploadRepository.findByIdWithDeleted(id);
    if (!row) throw new AppError('Upload not found', 404);
    if (!row.deleted_at) throw new AppError('Upload is not deleted', 400);
    assertCanAccess(row, actor);

    const restored = await uploadRepository.restore(id);
    await uploadRepository.insertAudit({
      upload_id: id,
      action: AUDIT_ACTIONS.RESTORE,
      actor_id: actor.userId,
      ip_address: ctx.ip,
      user_agent: ctx.userAgent,
      detail: {},
    });
    return sanitize(restored);
  },

  /** bulk soft-delete — each item's ownership is checked separately, partial success reported. */
  async bulkDelete(
    ids: string[],
    actor: UploadActor,
    ctx: AuditContext = {},
  ): Promise<BulkDeleteResult> {
    const deleted: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await this.softDelete(id, actor, ctx);
        deleted.push(id);
      } catch (err) {
        skipped.push({ id, reason: err instanceof Error ? err.message : String(err) });
      }
    }
    return { deleted, skipped };
  },
};
