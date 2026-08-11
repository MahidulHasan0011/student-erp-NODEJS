import { query } from '../../config/db.js';
import { buildWhereClause, type FilterConfig } from '../../utils/queryBuilder.js';
import { buildOrder } from '../../utils/order.js';
import type { ListQuery, Pagination } from '../../types/common.types.js';
import type { Json, UploadCategory, UploadRow } from '../../types/db.types.js';
import type { AuditAction } from './upload.constants.js';

export interface CreateUploadData {
  storage_key: string;
  original_name: string;
  mime_type: string;
  extension: string;
  /** declared by the client at presign time; re-verified on confirm */
  file_size: number;
  category: UploadCategory;
  uploaded_by: string;
  related_type?: string | null;
  related_id?: string | null;
}

export interface MarkReadyData {
  file_size: number | string;
  checksum?: string | null;
  metadata?: Json;
}

export interface InsertAuditData {
  upload_id: string;
  action: AuditAction;
  actor_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  detail?: Json;
}

const SORTABLE_FIELDS: Record<string, string> = {
  created_at: 'created_at',
  file_size: 'file_size',
  original_name: 'original_name',
  category: 'category',
};

const FILTER_CONFIG: FilterConfig = {
  searchableColumns: ['original_name'], // ?search=...
  filterableColumns: [
    { param: 'category', column: 'category' },
    { param: 'status', column: 'status' },
    { param: 'uploaded_by', column: 'uploaded_by' },
    { param: 'related_type', column: 'related_type' },
    { param: 'related_id', column: 'related_id' },
  ],
};

export const uploadRepository = {
  // PENDING row — created in the generate-url step. becomes READY on confirm.
  async create({
    storage_key,
    original_name,
    mime_type,
    extension,
    file_size,
    category,
    uploaded_by,
    related_type,
    related_id,
  }: CreateUploadData): Promise<UploadRow> {
    const { rows } = await query<UploadRow>(
      `INSERT INTO uploads
        (storage_key, original_name, mime_type, extension, file_size,
         category, uploaded_by, related_type, related_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        storage_key,
        original_name,
        mime_type,
        extension,
        file_size,
        category,
        uploaded_by,
        related_type || null,
        related_id || null,
      ],
    );
    return rows[0];
  },

  async findById(id: string): Promise<UploadRow | null> {
    const { rows } = await query<UploadRow>(
      `SELECT * FROM uploads WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] || null;
  },

  // restore/audit also needs the soft-deleted row
  async findByIdWithDeleted(id: string): Promise<UploadRow | null> {
    const { rows } = await query<UploadRow>(`SELECT * FROM uploads WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  // confirm: PENDING → READY, set the verified size/checksum/metadata
  async markReady(
    id: string,
    { file_size, checksum, metadata }: MarkReadyData,
  ): Promise<UploadRow | null> {
    const { rows } = await query<UploadRow>(
      `UPDATE uploads
         SET status = 'READY', file_size = $2, checksum = $3,
             metadata = $4::jsonb, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id, file_size, checksum || null, JSON.stringify(metadata || {})],
    );
    return rows[0] || null;
  },

  async markFailed(id: string): Promise<UploadRow | null> {
    const { rows } = await query<UploadRow>(
      `UPDATE uploads SET status = 'FAILED', updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id],
    );
    return rows[0] || null;
  },

  async findAll(
    queryOptions: ListQuery,
    { limit, offset }: Pick<Pagination, 'limit' | 'offset'>,
  ): Promise<UploadRow[]> {
    const values: unknown[] = [];
    const countRef = { value: 1 };
    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef);
    const { sortBy, sortOrder } = buildOrder(queryOptions, SORTABLE_FIELDS, 'created_at');

    values.push(limit, offset);
    const { rows } = await query<UploadRow>(
      `SELECT * FROM uploads
       ${where}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT $${countRef.value} OFFSET $${countRef.value + 1}`,
      values,
    );
    return rows;
  },

  async countAll(queryOptions: ListQuery): Promise<number> {
    const values: unknown[] = [];
    const countRef = { value: 1 };
    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef);
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM uploads ${where}`,
      values,
    );
    return parseInt(rows[0].count);
  },

  async softDelete(id: string): Promise<{ id: string } | null> {
    const { rows } = await query<{ id: string }>(
      `UPDATE uploads SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    return rows[0] || null;
  },

  async restore(id: string): Promise<UploadRow | null> {
    const { rows } = await query<UploadRow>(
      `UPDATE uploads SET deleted_at = NULL, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *`,
      [id],
    );
    return rows[0] || null;
  },

  // ── audit log ──
  async insertAudit({
    upload_id,
    action,
    actor_id,
    ip_address,
    user_agent,
    detail,
  }: InsertAuditData): Promise<void> {
    await query(
      `INSERT INTO upload_audit_logs
        (upload_id, action, actor_id, ip_address, user_agent, detail)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [
        upload_id,
        action,
        actor_id || null,
        ip_address || null,
        user_agent || null,
        JSON.stringify(detail || {}),
      ],
    );
  },
};
