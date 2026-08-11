import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

// ─────────────────────────────────────────────────────────────────────────────
// storage.service — the only place where we talk to the object store.
// The rest of the code (upload.service) only calls these functions; if the provider changes, change it here.
//
// MinIO, AWS S3 and Cloudflare R2 all speak the S3 API — so a single client works for all of them.
//   • MinIO  : STORAGE_ENDPOINT = http://localhost:9000, FORCE_PATH_STYLE = true, REGION = us-east-1  ← current
//   • AWS S3 : STORAGE_ENDPOINT empty, STORAGE_REGION = the actual region
//   • R2     : STORAGE_ENDPOINT = https://<acc>.r2.cloudflarestorage.com, REGION = 'auto'
// ─────────────────────────────────────────────────────────────────────────────

const miniO = new S3Client({
  region: env.STORAGE_REGION,
  // if an endpoint is given (R2/MinIO) it's used; keep it undefined for AWS
  endpoint: env.STORAGE_ENDPOINT || undefined,
  forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.STORAGE_ACCESS_KEY,
    secretAccessKey: env.STORAGE_SECRET_KEY,
  },
});

export interface UploadUrlParams {
  /** full object key inside the bucket */
  key: string;
  contentType: string;
  /** seconds the signed URL stays valid */
  ttl?: number;
}

export interface DownloadUrlParams {
  key: string;
  /** when set, the browser saves under this name instead of previewing */
  downloadName?: string;
  ttl?: number;
}

/** What the object store reports about an object that exists. */
export interface HeadObjectResult {
  contentLength: number;
  contentType: string | null;
  etag: string | null;
}

/** S3 signals a missing object either by HTTP 404 or by a NotFound error name. */
const isNotFound = (err: unknown): boolean => {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { $metadata?: { httpStatusCode?: number }; name?: string };
  return e.$metadata?.httpStatusCode === 404 || e.name === 'NotFound';
};

export const storageService = {
  /**
   * Pre-signed PUT URL for uploading. The frontend PUTs directly to this URL.
   * We sign the ContentType — so the client must send exactly this MIME (S3 rejects on mismatch).
   * The file's actual size is verified with headObject in the confirm step (signing it here causes trouble with some clients).
   */
  async getUploadUrl({
    key,
    contentType,
    ttl = env.STORAGE_UPLOAD_URL_TTL,
  }: UploadUrlParams): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: env.STORAGE_BUCKET,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(miniO, command, { expiresIn: ttl });
  },

  /**
   * Pre-signed GET URL for download/preview.
   * If downloadName is given the browser does "Save as" with that name (Content-Disposition: attachment).
   */
  async getDownloadUrl({
    key,
    downloadName,
    ttl = env.STORAGE_DOWNLOAD_URL_TTL,
  }: DownloadUrlParams): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: env.STORAGE_BUCKET,
      Key: key,
      ResponseContentDisposition: downloadName
        ? `attachment; filename="${encodeURIComponent(downloadName)}"`
        : undefined,
    });
    return getSignedUrl(miniO, command, { expiresIn: ttl });
  },

  /**
   * Whether the object actually exists in storage + its actual size/type/etag.
   * In the confirm step we compare against the declared size; returns null if it doesn't exist.
   */
  async headObject(key: string): Promise<HeadObjectResult | null> {
    try {
      const res = await miniO.send(new HeadObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
      return {
        contentLength: Number(res.ContentLength ?? 0),
        contentType: res.ContentType || null,
        etag: res.ETag ? res.ETag.replaceAll('"', '') : null,
      };
    } catch (err) {
      // 404/NotFound → object doesn't exist; re-throw any other error
      if (isNotFound(err)) return null;
      throw err;
    }
  },

  /** Delete an object from storage (hard delete — used in temp cleanup / purge jobs). */
  async deleteObject(key: string): Promise<void> {
    await miniO.send(new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
  },
};
