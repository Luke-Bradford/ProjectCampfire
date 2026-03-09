import type { Job } from "bullmq";
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
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

      // Single atomic UPDATE using Postgres array index assignment.
      // image_urls is 1-based in Postgres, so data.index (0-based) becomes data.index+1.
      // Both the index and the URL are passed as parameterized values — no sql.raw used.
      // This avoids the read-modify-write race when multiple images for the same post
      // are processed concurrently.
      const pgIndex = data.index + 1;
      await db.execute(
        sql`UPDATE posts SET image_urls[${pgIndex}] = ${storageUrl(outKey)} WHERE id = ${data.postId}`,
      );

      console.log(`[image] post image processed for post ${data.postId}[${data.index}] → ${outKey}`);
      break;
    }

    default: {
      console.warn("[image] unknown job type:", (data as { type: string }).type);
    }
  }
}
