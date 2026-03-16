import type { Job } from "bullmq";
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { user, posts, comments } from "@/server/db/schema";
import { minio, storageUrl, bufferIsGif } from "@/server/storage";
import { env } from "@/env";
import type { ImageJobPayload } from "@/server/jobs/image-jobs";
import { logger } from "@/lib/logger";

const log = logger.child("image");

const AVATAR_SIZE = 256; // px, square
const POST_IMAGE_MAX = 1280; // px, longest edge
const MAX_POST_IMAGES = 4; // must match Zod .max() in feed.create
const MAX_COMMENT_IMAGES = 1; // must match Zod .max() in feed.comment

async function downloadFromMinio(key: string): Promise<Buffer> {
  const stream = await minio.getObject(env.MINIO_BUCKET, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
    } else if (chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk));
    } else {
      throw new Error(`[image] unexpected chunk type from MinIO stream: ${typeof chunk}`);
    }
  }
  return Buffer.concat(chunks);
}

async function uploadProcessed(key: string, buffer: Buffer, contentType = "image/webp"): Promise<void> {
  await minio.putObject(env.MINIO_BUCKET, key, buffer, buffer.byteLength, {
    "Content-Type": contentType,
  });
}

/**
 * Derives the processed key from a raw key.
 * GIFs are stored as-is (preserving animation) — suffix ".gif".
 * All other images are converted to WebP — suffix ".webp".
 */
function processedKey(rawKey: string, gif = false): string {
  return rawKey.replace(/-raw$/, "") + (gif ? ".gif" : ".webp");
}

/**
 * Download raw, optionally convert via Sharp, upload processed, then delete the raw object.
 * GIFs are passed through without conversion to preserve animation.
 * Deleting the raw object after a confirmed upload avoids double-storage for the sweep interval.
 * Returns the processed object key.
 */
async function processAndStore(rawKey: string, resizeMax: number): Promise<string> {
  const raw = await downloadFromMinio(rawKey);
  const gif = bufferIsGif(raw);
  let processed: Buffer;
  if (gif) {
    processed = raw;
  } else {
    processed = await sharp(raw)
      .resize(resizeMax, resizeMax, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  }
  const outKey = processedKey(rawKey, gif);
  await uploadProcessed(outKey, processed, gif ? "image/gif" : "image/webp");
  // Remove the raw object now that the processed copy is confirmed stored.
  await minio.removeObject(env.MINIO_BUCKET, rawKey);
  return outKey;
}

export async function processImageJob(job: Job<ImageJobPayload>) {
  const data = job.data;

  switch (data.type) {
    case "process_avatar": {
      const raw = await downloadFromMinio(data.key);
      const processed = await sharp(raw)
        .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "centre" })
        .webp({ quality: 85 })
        .toBuffer();

      const outKey = processedKey(data.key);
      await uploadProcessed(outKey, processed);

      await db
        .update(user)
        .set({ image: storageUrl(outKey) })
        .where(eq(user.id, data.userId));

      log.info("avatar processed", { userId: data.userId, outKey });
      break;
    }

    case "process_post_image": {
      const outKey = await processAndStore(data.key, POST_IMAGE_MAX);

      // SELECT FOR UPDATE serialises concurrent jobs for the same post at the DB level.
      // Without this lock, two concurrent UPDATEs each snapshot image_urls independently
      // and the last writer silently drops the other's URL (last-writer-wins race).
      //
      // UPDATE uses generate_series + LEFT JOIN unnest to safely write one slot into a
      // 4-element array. Direct array index assignment (SET arr[n] = val) produces a
      // subscript-range array ([n:n]={val}) on NULL/empty columns — breaking consumers.
      //
      // NULL slots: unprocessed positions stay NULL. Consumers must .filter(Boolean).
      // Both index and URL are parameterised — no sql.raw used.
      const pgIndex = data.index + 1;
      const url = storageUrl(outKey);
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM ${posts} WHERE id = ${data.postId} FOR UPDATE`);
        await tx.execute(sql`
          UPDATE ${posts}
          SET image_urls = (
            SELECT array_agg(CASE WHEN g.i = ${pgIndex} THEN ${url} ELSE a.v END ORDER BY g.i)
            FROM generate_series(1, ${MAX_POST_IMAGES}) AS g(i)
            LEFT JOIN unnest(COALESCE(image_urls, ARRAY[]::text[])) WITH ORDINALITY AS a(v, i)
              ON a.i = g.i
          )
          WHERE id = ${data.postId}
        `);
      });

      log.info("post image processed", { postId: data.postId, index: data.index, outKey });
      break;
    }

    case "process_comment_image": {
      const outKey = await processAndStore(data.key, POST_IMAGE_MAX);

      // Same SELECT FOR UPDATE + generate_series pattern as process_post_image.
      // Comments support up to 1 image (index is always 0), but the array approach
      // is kept consistent so the pattern is familiar and index could be extended.
      const pgIndex = data.index + 1;
      const url = storageUrl(outKey);
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM ${comments} WHERE id = ${data.commentId} FOR UPDATE`);
        await tx.execute(sql`
          UPDATE ${comments}
          SET image_urls = (
            SELECT array_agg(CASE WHEN g.i = ${pgIndex} THEN ${url} ELSE a.v END ORDER BY g.i)
            FROM generate_series(1, ${MAX_COMMENT_IMAGES}) AS g(i)
            LEFT JOIN unnest(COALESCE(image_urls, ARRAY[]::text[])) WITH ORDINALITY AS a(v, i)
              ON a.i = g.i
          )
          WHERE id = ${data.commentId}
        `);
      });

      log.info("comment image processed", { commentId: data.commentId, index: data.index, outKey });
      break;
    }

    case "sweep_orphaned_uploads": {
      await sweepOrphanedUploads();
      break;
    }

    default: {
      log.warn("unknown job type", { type: (data as { type: string }).type });
    }
  }
}

/** Minimum age (ms) before a raw upload is considered orphaned. */
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Lists all objects under posts/ and deletes raw uploads that:
 *   1. are older than ORPHAN_AGE_MS, and
 *   2. have no corresponding processed (.webp) object
 *
 * Processed key = rawKey.replace(/-raw$/, "") + ".webp"
 * e.g. posts/u1/id1/abc-raw → posts/u1/id1/abc.webp
 */
async function sweepOrphanedUploads(): Promise<void> {
  const bucket = env.MINIO_BUCKET;
  const now = Date.now();

  // Collect all keys under posts/ (raw and processed alike).
  const allKeys = new Set<string>();
  const rawCandidates: { key: string; lastModified: Date }[] = [];

  await new Promise<void>((resolve, reject) => {
    const stream = minio.listObjects(bucket, "posts/", true);
    stream.on("data", (obj) => {
      if (!obj.name) return;
      allKeys.add(obj.name);
      if (obj.name.endsWith("-raw") && obj.lastModified) {
        rawCandidates.push({ key: obj.name, lastModified: obj.lastModified });
      }
    });
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  const toDelete: string[] = [];
  for (const { key, lastModified } of rawCandidates) {
    const ageMs = now - lastModified.getTime();
    if (ageMs < ORPHAN_AGE_MS) continue; // too recent — may still be processing
    // Processed key is .gif for GIFs, .webp for everything else.
    // Check both — the worker deletes raw files immediately on success, so
    // surviving raw files are failures/crashes where the processed key is absent.
    const base = key.replace(/-raw$/, "");
    if (!allKeys.has(base + ".webp") && !allKeys.has(base + ".gif")) {
      toDelete.push(key);
    }
  }

  if (toDelete.length === 0) {
    log.info("sweep_orphaned_uploads: nothing to delete");
    return;
  }

  // MinIO batch delete is capped at 1000 objects per request. Chunk to be safe.
  const BATCH_SIZE = 1000;
  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    await minio.removeObjects(bucket, toDelete.slice(i, i + BATCH_SIZE));
  }
  log.info("sweep_orphaned_uploads: deleted orphaned uploads", { count: toDelete.length });
}
