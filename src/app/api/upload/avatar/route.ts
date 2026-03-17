import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { auth } from "@/server/auth";
import { validateImage, uploadImage, ImageValidationError } from "@/server/storage";
import { enqueueProcessAvatar } from "@/server/jobs/image-jobs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Buffer the body with a hard cap before parsing FormData.
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
      return NextResponse.json({ error: "Image exceeds the 5 MB size limit." }, { status: 413 });
    }
    chunks.push(value);
  }

  // Re-parse the accumulated bytes as FormData. This is the same pattern used by
  // the post-image route. Trade-off: the file bytes exist in three buffers briefly
  // (chunks[], bodyBuffer, then file.arrayBuffer()). At the 5 MB cap this is ~15 MB
  // per concurrent upload — acceptable for low-frequency avatar changes.
  const contentType = req.headers.get("content-type") ?? "";
  const bodyBuffer = Buffer.concat(chunks);
  const formData = await new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": contentType },
    body: bodyBuffer,
  }).formData();

  const file = formData.get("file");
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

  // Store raw under avatars/{userId}/{cuid}-raw — worker processes + updates user.image.
  const key = `avatars/${userId}/${createId()}-raw`;
  await uploadImage(key, buffer, file.type);
  await enqueueProcessAvatar(userId, key);

  return NextResponse.json({ ok: true });
}
