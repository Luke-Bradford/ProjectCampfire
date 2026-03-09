import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { auth } from "@/server/auth";
import { validateImage, uploadImage, ImageValidationError } from "@/server/storage";
import { assertRateLimit } from "@/server/ratelimit";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — must match validateImage in storage.ts
// uploadId is a client-generated cuid used only to namespace the MinIO path.
// It is NOT the real DB post ID. Validated to be a safe path component.
const UPLOAD_ID_RE = /^[a-z0-9]{10,}$/;

export async function POST(req: NextRequest) {
  // Auth
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Reject oversized bodies before buffering — avoids OOM from arbitrarily large uploads.
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BYTES) {
    return NextResponse.json(
      { error: `Image exceeds the 5 MB size limit.` },
      { status: 413 }
    );
  }

  // Rate limit: 20 image uploads per minute per user
  try {
    await assertRateLimit(`rl:upload:post-image:${userId}`, 20, 60);
  } catch {
    return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 });
  }

  const formData = await req.formData();
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

  // index not used for MinIO key disambiguation here — createId() ensures uniqueness.
  // Processing jobs are enqueued by feed.create with the correct index after post insert.
  const key = `posts/${uploadId}/${createId()}-raw`;
  await uploadImage(key, buffer, file.type);
  // Do NOT enqueue processing here. feed.create re-enqueues with the real postId and
  // correct index after the DB insert, so the worker updates the right row.

  return NextResponse.json({ key });
}
