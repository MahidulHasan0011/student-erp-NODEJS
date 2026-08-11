import { AppError } from '../../utils/appError.js';
import {
  assertString,
  assertInteger,
  assertUuid,
  assertEnum,
  assertArray,
} from '../../utils/validators.js';
import {
  UPLOAD_CATEGORIES,
  UPLOAD_STATUS,
  normalizeExt,
  resolveFileType,
  isGroupAllowedForCategory,
  type FileGroupName,
} from './upload.constants.js';
import type { ListQuery } from '../../types/common.types.js';
import type { UploadCategory, UploadStatus } from '../../types/db.types.js';

const STATUSES = Object.values(UPLOAD_STATUS);

/** What generateUrl() hands to the service — every field already validated. */
export interface GenerateUrlInput {
  original_name: string;
  category: UploadCategory;
  mime_type: string;
  extension: string;
  file_size: number;
  group: FileGroupName;
  related_type?: string;
  related_id?: string;
}

export interface ConfirmInput {
  upload_id: string;
  checksum?: string;
}

export interface UploadListFilters {
  category?: UploadCategory;
  status?: UploadStatus;
  uploaded_by?: string;
  related_type?: string;
  related_id?: string;
  search?: string;
}

/** Request bodies are `any` at the Express boundary — hence the unknown-shaped inputs. */
interface RawBody {
  [key: string]: unknown;
}

// extract the extension from the filename (part after the last dot)
const extFromName = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1) : '';
};

export const uploadValidation = {
  /**
   * validates the POST /uploads/generate-url body and returns a normalized object.
   * this is where it happens: extension + MIME consistency, category policy, size limit.
   */
  generateUrl(body: RawBody = {}): GenerateUrlInput {
    const original_name = assertString(body.original_name, 'original_name', { max: 255 });
    const category = assertEnum(body.category, 'category', UPLOAD_CATEGORIES);
    const file_size = assertInteger(body.file_size, 'file_size', { min: 1 });
    const mime_type = assertString(body.mime_type, 'mime_type', { max: 127 });

    const ext = normalizeExt(extFromName(original_name));
    if (!ext) throw new AppError('original_name must include a file extension', 400);

    // validate ext + MIME together — which group it belongs to (prevents spoofing)
    const resolved = resolveFileType(ext, mime_type);
    if (!resolved) {
      throw new AppError(`Unsupported or mismatched file type: .${ext} (${mime_type})`, 400);
    }

    // whether this group is allowed for this category
    if (!isGroupAllowedForCategory(category, resolved.group)) {
      throw new AppError(`${resolved.group} files are not allowed for category ${category}`, 400);
    }

    // size limit (per group)
    if (file_size > resolved.maxBytes) {
      const limitMb = Math.round(resolved.maxBytes / (1024 * 1024));
      throw new AppError(`File too large — max ${limitMb}MB for ${resolved.group}`, 400);
    }

    // optional polymorphic link
    const related_type = assertString(body.related_type, 'related_type', {
      required: false,
      max: 50,
    });
    const related_id = assertUuid(body.related_id, 'related_id', { required: false });

    return {
      original_name,
      category,
      mime_type: resolved.mime,
      extension: resolved.ext,
      file_size,
      group: resolved.group,
      related_type,
      related_id,
    };
  },

  /** POST /uploads/confirm */
  confirm(body: RawBody = {}): ConfirmInput {
    return {
      upload_id: assertUuid(body.upload_id, 'upload_id'),
      // the client may optionally send its own computed checksum
      checksum: assertString(body.checksum, 'checksum', { required: false, max: 128 }),
    };
  },

  /** GET /uploads list query → normalized filters (page/limit handled by the pagination util) */
  listQuery(query: ListQuery = {}): UploadListFilters {
    return {
      category: assertEnum(query.category, 'category', UPLOAD_CATEGORIES, { required: false }),
      status: assertEnum(query.status, 'status', STATUSES, { required: false }),
      uploaded_by: assertUuid(query.uploaded_by, 'uploaded_by', { required: false }),
      related_type: assertString(query.related_type, 'related_type', { required: false, max: 50 }),
      related_id: assertUuid(query.related_id, 'related_id', { required: false }),
      search: assertString(query.search, 'search', { required: false, max: 255 }),
    };
  },

  /** :id param */
  id(params: RawBody = {}): string {
    return assertUuid(params.id, 'id');
  },

  /** bulk operation body { ids: [...] } */
  bulkIds(body: RawBody = {}): string[] {
    const ids = assertArray(body.ids, 'ids', { min: 1, max: 100 });
    return ids.map((id, i) => assertUuid(id, `ids[${i}]`));
  },
};
