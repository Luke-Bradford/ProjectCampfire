import type { Job } from "bullmq";
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { user, posts } from "@/server/db/schema";
import { minio, storageUrl } from "@/server/storage";
import { env } from "@/env";
import type { ImageJobPayload } from "@/server/jobs/image-jobs";

const AVATAR_SIZE = 256; // px, square
const POST_IMAGE_MAX = 1280; // px, longest edge

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

async function uploadProcessed(key: string, buffer: Buffer): Promise<void> {
  await minio.putObject(env.MINIO_BUCKET, key, buffer, buffer.byteLength, {
    "Content-Type": "image/webp",
  });
}

/** Derives the processed key from a raw key by stripping the "-raw" suffix and adding ".webp". */
function processedKey(rawKey: string): string {
  return rawKey.replace(/-raw$/, "") + ".webp";
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

      console.log(`[image] avatar processed for user ${data.userId} → ${outKey}`);
      break;
    }

    case "process_post_image": {
      const raw = await downloadFromMinio(data.key);
      const processed = await sharp(raw)
        .resize(POST_IMAGE_MAX, POST_IMAGE_MAX, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();

      const outKey = processedKey(data.key);
      await uploadProcessed(outKey, processed);

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
            FROM generate_series(1, 4) AS g(i)
            LEFT JOIN unnest(COALESCE(image_urls, ARRAY[]::text[])) WITH ORDINALITY AS a(v, i)
              ON a.i = g.i
          )
          WHERE id = ${data.postId}
        `);
      });

      console.log(`[image] post image processed for post ${data.postId}[${data.index}] → ${outKey}`);
      break;
    }

    default: {
      console.warn("[image] unknown job type:", (data as { type: string }).type);
    }
  }
}
