import { Client } from "minio";
import { env } from "@/env";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export const minio = new Client({
  endPoint: env.MINIO_ENDPOINT,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
  useSSL: env.NODE_ENV === "production",
});

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

/**
 * Validates an image buffer before any storage operation.
 * Throws ImageValidationError if the type or size is not allowed.
 */
export function validateImage(buffer: Buffer, mimeType: string): void {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ImageValidationError(
      `Unsupported image type "${mimeType}". Allowed: jpeg, png, gif, webp.`,
    );
  }
  if (buffer.byteLength > MAX_BYTES) {
    throw new ImageValidationError(
      `Image exceeds the 5 MB size limit (got ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB).`,
    );
  }
}

/**
 * Uploads a validated image buffer to MinIO.
 * Returns the object key (not a full URL — callers build the URL themselves).
 */
export async function uploadImage(
  key: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  validateImage(buffer, mimeType);
  await minio.putObject(env.MINIO_BUCKET, key, buffer, buffer.byteLength, {
    "Content-Type": mimeType,
  });
  return key;
}

/** Builds a public URL for an object stored in MinIO. */
export function storageUrl(key: string): string {
  const proto = env.NODE_ENV === "production" ? "https" : "http";
  return `${proto}://${env.MINIO_ENDPOINT}/${env.MINIO_BUCKET}/${key}`;
}
