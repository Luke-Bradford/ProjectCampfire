import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { auth } from "@/server/auth";
import { validateImage, uploadImage, ImageValidationError, GIF_MAX_BYTES } from "@/server/storage";
import { assertRateLimit } from "@/server/ratelimit";

// Stream cap is the highest allowed limit across all types.
// validateImage enforces the per-type limit (5 MB non-GIF, 10 MB GIF) after buffering.
const MAX_BYTES = GIF_MAX_BYTES; // 10 MB
// uploadId is a client-generated cuid used only to namespace the MinIO path.
// better-auth user IDs use mixed-case alphanumeric — pattern must allow uppercase.
const UPLOAD_ID_RE = /^[A-Za-z0-9]{10,}$/;

export async function POST(req: NextRequest) {
  // Auth
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Rate limit: 20 image uploads per minute per user
  try {
    await assertRateLimit(`rl:upload:post-image:${userId}`, 20, 60);
  } catch {
    return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 });
  }

  // Stream the body with a hard byte cap — Content-Length alone is bypassable.
  // This accumulates the raw body, enforces the limit, then parses as FormData.
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const reader = req.body?.getReader();
  if (!reader) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BYTES) {
      await reader.cancel();
      // Generic message — validateImage() will surface the per-type limit (5 MB / 10 MB)
      // once the full buffer is available. This only fires for truly oversized requests.
      return NextResponse.json({ error: "Image exceeds the maximum allowed size." }, { status: 413 });
    }
    chunks.push(value);
  }

  // Re-parse the accumulated bytes as FormData using the original Content-Type (multipart boundary).
  const contentType = req.headers.get("content-type") ?? "";
  const bodyBuffer = Buffer.concat(chunks);
  const formData = await new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": contentType },
    body: bodyBuffer,
  }).formData();

  const uploadId = formData.get("postId"); // field name kept as "postId" for client compat
  const file = formData.get("file");

  // Validate uploadId is a safe alphanumeric path component (no path traversal)
  if (typeof uploadId !== "string" || !UPLOAD_ID_RE.test(uploadId)) {
    return NextResponse.json({ error: "Invalid uploadId" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    validateImage(buffer, file.type);
  } catch (err) {
    if (err instanceof ImageValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }

  // Key includes userId so feed.create can verify ownership by prefix check.
  // Pattern: posts/{userId}/{uploadId}/{cuid}-raw
  const key = `posts/${userId}/${uploadId}/${createId()}-raw`;
  await uploadImage(key, buffer, file.type);
  // Do NOT enqueue processing here. feed.create re-enqueues with the real postId and
  // correct index after the DB insert, so the worker updates the right row.

  return NextResponse.json({ key });
}
