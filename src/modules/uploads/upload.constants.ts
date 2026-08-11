import { randomUUID } from 'crypto';
import type { UploadCategory } from '../../types/db.types.js';

// ─────────────────────────────────────────────────────────────────────────────
// upload.constants — all allow-lists in one place. To add a new file-type/category,
// change it here only; service/validation code stays unchanged.
// ─────────────────────────────────────────────────────────────────────────────

const MB = 1024 * 1024;

// must match upload_category_enum exactly (migration 004_uploads.sql).
// Re-exported from types/db.types.ts rather than redeclared, so the runtime list and
// the UploadCategory union can never drift from each other.
export { UPLOAD_CATEGORIES } from '../../types/db.types.js';
export type { UploadCategory } from '../../types/db.types.js';

export const UPLOAD_STATUS = { PENDING: 'PENDING', READY: 'READY', FAILED: 'FAILED' } as const;

export const AUDIT_ACTIONS = {
  GENERATE_URL: 'GENERATE_URL',
  CONFIRM: 'CONFIRM',
  DOWNLOAD: 'DOWNLOAD',
  DELETE: 'DELETE',
  RESTORE: 'RESTORE',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** The three size/permission buckets every accepted file falls into. */
export type FileGroupName = 'IMAGE' | 'DOCUMENT' | 'ARCHIVE';

export interface FileGroupConfig {
  maxBytes: number;
  /** extension → the MIME types accepted for it */
  extensions: Record<string, string[]>;
}

// ── file groups: accepted MIME(s) per extension + per-group size limit ──
// multiple MIMEs are kept per ext because csv/zip/rar MIME varies across browser/OS.
export const FILE_GROUPS: Record<FileGroupName, FileGroupConfig> = {
  IMAGE: {
    maxBytes: 5 * MB,
    extensions: {
      jpg: ['image/jpeg'],
      jpeg: ['image/jpeg'],
      png: ['image/png'],
      webp: ['image/webp'],
      gif: ['image/gif'],
    },
  },
  DOCUMENT: {
    maxBytes: 25 * MB,
    extensions: {
      pdf: ['application/pdf'],
      doc: ['application/msword'],
      docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      xls: ['application/vnd.ms-excel'],
      xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      csv: ['text/csv', 'application/vnd.ms-excel', 'application/csv', 'text/plain'],
      ppt: ['application/vnd.ms-powerpoint'],
      pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
      txt: ['text/plain'],
    },
  },
  ARCHIVE: {
    maxBytes: 100 * MB,
    extensions: {
      zip: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
      rar: ['application/vnd.rar', 'application/x-rar-compressed', 'application/octet-stream'],
    },
  },
};

// ── which groups are allowed per category (business rule) ──
// e.g. profile/logo only image; assignment allows doc/image/archive.
// Typed as a total Record, so adding a category to the enum without a policy is a compile error.
export const CATEGORY_POLICY: Record<UploadCategory, FileGroupName[]> = {
  STUDENT_PROFILE: ['IMAGE'],
  TEACHER_PROFILE: ['IMAGE'],
  SCHOOL_LOGO: ['IMAGE'],
  ASSIGNMENT: ['DOCUMENT', 'IMAGE', 'ARCHIVE'],
  QUESTION_PAPER: ['DOCUMENT', 'IMAGE'],
  ANSWER_SHEET: ['DOCUMENT', 'IMAGE', 'ARCHIVE'],
  EXAM_ATTACHMENT: ['DOCUMENT', 'IMAGE', 'ARCHIVE'],
  LEAVE_ATTACHMENT: ['IMAGE', 'DOCUMENT'],
  ATTENDANCE_PROOF: ['IMAGE', 'DOCUMENT'],
  CERTIFICATE: ['IMAGE', 'DOCUMENT'],
  NOTICE_ATTACHMENT: ['IMAGE', 'DOCUMENT', 'ARCHIVE'],
  OTHER: ['IMAGE', 'DOCUMENT', 'ARCHIVE'],
};

// ── helpers ──────────────────────────────────────────────────────────────────

// The two helpers below take `string | null | undefined` rather than `unknown`: every
// call site passes a string, and accepting `unknown` meant String() could silently turn
// an object into '[object Object]' and then fail the lookup for a confusing reason.
/** normalized form of an extension (lowercase, no leading dot/whitespace). */
export const normalizeExt = (ext: string | null | undefined): string =>
  String(ext || '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '');

export interface ResolvedFileType {
  group: FileGroupName;
  ext: string;
  mime: string;
  maxBytes: number;
}

/**
 * validates extension + MIME together and returns which group it belongs to — anti-spoofing.
 * (ext=png but mime=application/zip matches no group → null)
 */
export const resolveFileType = (
  extension: string | null | undefined,
  mimeType: string | null | undefined,
): ResolvedFileType | null => {
  const ext = normalizeExt(extension);
  const mime = String(mimeType || '')
    .trim()
    .toLowerCase();
  // Object.entries widens the key to string; the assertion restores the group union
  for (const [group, cfg] of Object.entries(FILE_GROUPS) as [FileGroupName, FileGroupConfig][]) {
    const allowedMimes = cfg.extensions[ext];
    if (allowedMimes && allowedMimes.includes(mime)) {
      return { group, ext, mime, maxBytes: cfg.maxBytes };
    }
  }
  return null;
};

/** whether this group is allowed for the given category. */
export const isGroupAllowedForCategory = (
  category: UploadCategory,
  group: FileGroupName,
): boolean => (CATEGORY_POLICY[category] || []).includes(group);

export interface StorageKeyParts {
  category: UploadCategory;
  uploadedBy: string;
  ext: string;
}

/**
 * the storage key (path inside the bucket) is always built by the backend — never the client.
 * format: category/uploaderId/YYYY/MM/<uuid>.<ext>
 *   → no collisions, no path-traversal, easy to list/lifecycle by prefix.
 */
export const buildStorageKey = ({ category, uploadedBy, ext }: StorageKeyParts): string => {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${category.toLowerCase()}/${uploadedBy}/${yyyy}/${mm}/${randomUUID()}.${normalizeExt(ext)}`;
};
