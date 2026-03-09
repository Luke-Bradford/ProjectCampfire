"use client";

import { useRef, useState } from "react";
import { createId } from "@paralleldrive/cuid2";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const MAX_CHARS = 1000;
const MAX_IMAGES = 4;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

type SelectedImage = {
  /** Stable id used as the postId in the upload path — NOT the real DB post id. */
  uploadId: string;
  file: File;
  preview: string;
  key: string | null; // MinIO raw key after upload; null = uploading
  error: string | null;
};

export function PostComposer({ groupId, eventId, onPosted }: { groupId?: string; eventId?: string; onPosted: () => void }) {
  const [body, setBody] = useState("");
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const create = api.feed.create.useMutation({
    onSuccess: () => {
      images.forEach((img) => URL.revokeObjectURL(img.preview));
      setBody("");
      setImages([]);
      onPosted();
    },
  });

  const remaining = MAX_CHARS - body.length;
  const nearLimit = remaining <= 100;
  const isUploading = uploadingCount > 0;
  const hasErrors = images.some((img) => img.error !== null);
  const allUploaded = images.every((img) => img.key !== null);
  const canPost =
    !!body.trim() &&
    !isUploading &&
    !create.isPending &&
    !hasErrors &&
    allUploaded;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    const slots = MAX_IMAGES - images.length;
    const toAdd = files.slice(0, slots).map((file): SelectedImage => ({
      uploadId: createId(),
      file,
      preview: URL.createObjectURL(file),
      key: null,
      error: ALLOWED_TYPES.includes(file.type) ? null : `Unsupported type "${file.type}"`,
    }));

    setImages((prev) => [...prev, ...toAdd]);

    const valid = toAdd.filter((img) => img.error === null);
    if (valid.length) void uploadAll(valid);
  }

  async function uploadAll(toUpload: SelectedImage[]) {
    setUploadingCount((n) => n + toUpload.length);
    try {
      await Promise.all(toUpload.map(uploadOne));
    } finally {
      setUploadingCount((n) => n - toUpload.length);
    }
  }

  async function uploadOne(img: SelectedImage) {
    const fd = new FormData();
    fd.append("file", img.file);
    // uploadId is used only for the MinIO path. The real DB postId is assigned on submit
    // and passed to enqueueProcessPostImage, so the worker updates the correct row.
    fd.append("postId", img.uploadId);

    try {
      const res = await fetch("/api/upload/post-image", { method: "POST", body: fd });
      const json = (await res.json()) as { key?: string; error?: string };
      setImages((prev) =>
        prev.map((i) =>
          i.uploadId === img.uploadId
            ? { ...i, key: json.key ?? null, error: json.error ?? (json.key ? null : "Upload failed") }
            : i
        )
      );
    } catch {
      setImages((prev) =>
        prev.map((i) =>
          i.uploadId === img.uploadId ? { ...i, error: "Upload failed. Try again." } : i
        )
      );
    }
  }

  function removeImage(uploadId: string) {
    setImages((prev) => {
      const img = prev.find((i) => i.uploadId === uploadId);
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter((i) => i.uploadId !== uploadId);
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canPost) return;
    const imageKeys = images.map((img) => img.key).filter((k): k is string => k !== null);
    create.mutate({
      body: body.trim(),
      groupId,
      eventId,
      imageKeys: imageKeys.length ? imageKeys : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border p-4">
      <Textarea
        placeholder="What's on your mind?"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MAX_CHARS}
      />

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div key={img.uploadId} className="relative h-20 w-20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.preview} alt="" className="h-full w-full rounded object-cover" />
              {img.key === null && !img.error && (
                <div className="absolute inset-0 flex items-center justify-center rounded bg-black/50 text-xs text-white">
                  Uploading…
                </div>
              )}
              {img.error && (
                <div className="absolute inset-0 flex items-center justify-center rounded bg-destructive/80 p-1 text-center text-xs text-white leading-tight">
                  {img.error}
                </div>
              )}
              <button
                type="button"
                aria-label="Remove image"
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border bg-background text-xs text-muted-foreground hover:text-destructive"
                onClick={() => removeImage(img.uploadId)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {images.length < MAX_IMAGES && (
            <>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
              >
                + Photo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_TYPES.join(",")}
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
            </>
          )}
          <span className={`text-xs ${nearLimit ? "text-destructive" : "text-muted-foreground"}`}>
            {remaining} chars remaining
          </span>
        </div>
        <Button type="submit" size="sm" disabled={!canPost}>
          {create.isPending ? "Posting…" : isUploading ? "Uploading…" : "Post"}
        </Button>
      </div>
    </form>
  );
}
