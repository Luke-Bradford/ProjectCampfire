import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { auth } from "@/server/auth";
import { validateImage, uploadImage } from "@/server/storage";
import { ImageValidationError } from "@/server/storage";
import { enqueueProcessPostImage } from "@/server/jobs/image-jobs";
import { assertRateLimit } from "@/server/ratelimit";

const MAX_IMAGES = 4;

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

  const formData = await req.formData();
  const postId = formData.get("postId");
  const indexStr = formData.get("index");
  const file = formData.get("file");

  if (typeof postId !== "string" || !postId) {
    return NextResponse.json({ error: "Missing postId" }, { status: 400 });
  }
  const index = Number(indexStr);
  if (!Number.isInteger(index) || index < 0 || index >= MAX_IMAGES) {
    return NextResponse.json({ error: "index must be 0–3" }, { status: 400 });
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

  const key = `posts/${postId}/${index}-${createId()}-raw`;
  await uploadImage(key, buffer, file.type);
  await enqueueProcessPostImage(postId, key, index);

  return NextResponse.json({ key, index });
}
