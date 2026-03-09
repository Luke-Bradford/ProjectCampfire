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
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

async function uploadProcessed(key: string, buffer: Buffer): Promise<void> {
  await minio.putObject(env.MINIO_BUCKET, key, buffer, buffer.byteLength, {
    "Content-Type": "image/webp",
  });
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

      const outKey = data.key.replace(/(\.[^.]+)?$/, ".webp");
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

      const outKey = data.key.replace(/(\.[^.]+)?$/, ".webp");
      await uploadProcessed(outKey, processed);

      // Append the processed URL into the imageUrls array at the correct index.
      // Uses a Postgres array assignment: imageUrls[index+1] (1-based in Postgres).
      await db
        .update(posts)
        .set({
          imageUrls: sql`array_cat(
            coalesce(image_urls[1:${sql.raw(String(data.index))}], ARRAY[]::text[]),
            ARRAY[${storageUrl(outKey)}]::text[]
          )`,
        })
        .where(eq(posts.id, data.postId));

      console.log(`[image] post image processed for post ${data.postId}[${data.index}] → ${outKey}`);
      break;
    }

    default: {
      console.warn("[image] unknown job type:", (data as { type: string }).type);
    }
  }
}
