import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { posts } from "@/server/db/schema";
import { uploadImage, ImageValidationError, ALLOWED_IMAGE_MIME_TYPES } from "@/server/storage";
import { enqueueProcessAvatar, enqueueProcessPostImage } from "@/server/jobs/image-jobs";

const MAX_POST_IMAGES = 4;
// Base64 overhead is ~4/3 — 5 MB raw → ~6.67 MB base64. Allow a small margin.
const MAX_BASE64_BYTES = 7_200_000;

function toBuffer(base64: string): Buffer {
  return Buffer.from(base64, "base64");
}

function imageInput() {
  return z.object({
    /** Base64-encoded image data (no data URI prefix). */
    data: z.string().min(1).max(MAX_BASE64_BYTES),
    mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES),
  });
}

export const uploadRouter = createTRPCRouter({
  /**
   * Upload and process a user avatar.
   * The raw file is stored immediately; a background job resizes it to 256×256 webp
   * and updates user.image once done.
   */
  avatar: protectedProcedure
    .input(imageInput())
    .mutation(async ({ ctx, input }) => {
      const buffer = toBuffer(input.data);
      const key = `avatars/${ctx.user.id}/${createId()}-raw`;

      try {
        await uploadImage(key, buffer, input.mimeType);
      } catch (err) {
        if (err instanceof ImageValidationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        throw err;
      }

      enqueueProcessAvatar(ctx.user.id, key).catch((err: unknown) =>
        console.error("[upload] failed to enqueue avatar processing for", ctx.user.id, err),
      );

      return { key };
    }),

  /**
   * Upload one image for a post (call up to 4 times).
   * index (0–3) determines its position in the post's imageUrls array.
   * The caller is responsible for creating the post first and passing its id.
   * Only the post's author may attach images.
   */
  postImage: protectedProcedure
    .input(
      z.object({
        postId: z.string().min(1),
        index: z.number().int().min(0).max(MAX_POST_IMAGES - 1),
        image: imageInput(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const post = await db.query.posts.findFirst({
        where: and(eq(posts.id, input.postId), eq(posts.authorId, ctx.user.id)),
        columns: { id: true },
      });
      if (!post) throw new TRPCError({ code: "NOT_FOUND" });

      const buffer = toBuffer(input.image.data);
      const key = `posts/${input.postId}/${input.index}-${createId()}-raw`;

      try {
        await uploadImage(key, buffer, input.image.mimeType);
      } catch (err) {
        if (err instanceof ImageValidationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        throw err;
      }

      enqueueProcessPostImage(input.postId, key, input.index).catch((err: unknown) =>
        console.error(
          "[upload] failed to enqueue post image processing for",
          input.postId,
          err,
        ),
      );

      return { key };
    }),
});
