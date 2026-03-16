"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { createId } from "@paralleldrive/cuid2";
import type { EmbedMetadata } from "@/server/db/schema/posts";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const GIF_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** GIF URLs must be served unoptimized so Next.js doesn't strip the animation. */
function isGifUrl(url: string): boolean {
  // Use a placeholder base so relative and protocol-relative URLs are handled safely.
  try { return new URL(url, "https://placeholder").pathname.endsWith(".gif"); } catch { return false; }
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

type CommentImageUpload = {
  uploadId: string;
  file: File;
  preview: string;
  key: string | null;
  error: string | null;
  abort: AbortController;
};

type PostAuthor = { id: string; name: string; username: string | null; image: string | null };
type CommentData = {
  id: string;
  body: string;
  imageUrls: (string | null)[] | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  author: PostAuthor;
  reactions: { id: string; userId: string; type: string }[];
};
type PostData = {
  id: string;
  body: string | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  pinnedAt: Date | null;
  imageUrls: (string | null)[] | null;
  embedMetadata: EmbedMetadata | null;
  author: PostAuthor;
  group: { id: string; name: string } | null;
  event: { id: string; title: string } | null;
  reactions: { id: string; userId: string; type: string }[];
  comments: CommentData[];
};

function CommentRow({
  comment,
  currentUserId,
  onRefresh,
}: {
  comment: CommentData;
  currentUserId: string;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const deleteComment = api.feed.deleteComment.useMutation({ onSuccess: onRefresh });
  const editComment = api.feed.editComment.useMutation({
    onSuccess: () => {
      setEditing(false);
      onRefresh();
    },
  });
  const toggleLike = api.feed.toggleLike.useMutation({ onSuccess: onRefresh });

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  // Sync editBody if comment body changes from a parent refetch while not editing
  useEffect(() => {
    if (!editing) setEditBody(comment.body);
  }, [comment.body, editing]);

  function cancelEdit() {
    setEditing(false);
    setEditBody(comment.body);
  }

  const likeCount = comment.reactions.filter((r) => r.type === "like").length;
  const hasLiked = comment.reactions.some((r) => r.type === "like" && r.userId === currentUserId);
  const isOwn = comment.author.id === currentUserId;

  return (
    <div className="flex gap-2">
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarImage src={comment.author.image ?? undefined} />
        <AvatarFallback className="text-xs">{initials(comment.author.name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-0.5">
        <p className="px-1 text-xs font-medium">{comment.author.name}</p>
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = editBody.trim();
              if (trimmed && trimmed !== comment.body) {
                editComment.mutate({ id: comment.id, body: trimmed });
              } else {
                cancelEdit();
              }
            }}
            className="flex gap-2"
          >
            <Textarea
              ref={textareaRef}
              rows={1}
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="min-h-0 resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelEdit();
              }}
            />
            <div className="flex flex-col gap-1">
              <Button type="submit" size="sm" disabled={!editBody.trim() || editComment.isPending}>
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={cancelEdit}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="rounded-lg bg-muted px-3 py-2 text-sm">
              {comment.body}
            </div>
            {(() => {
              const imgs = (comment.imageUrls ?? []).filter((u): u is string => {
                if (!u) return false;
                try { new URL(u); return true; } catch { return false; }
              });
              if (imgs.length === 0) return null;
              const imgUrl = imgs[0]!;
              return (
                <div className="mt-1">
                  <Image
                    src={imgUrl}
                    alt=""
                    width={0}
                    height={0}
                    sizes="50vw"
                    className="w-full max-w-xs rounded object-cover"
                    style={{ height: "auto", maxHeight: "200px" }}
                    unoptimized={isGifUrl(imgUrl)}
                  />
                </div>
              );
            })()}
          </>
        )}
        <div className="flex items-center gap-2 px-1">
          <span
            className="text-xs text-muted-foreground"
            title={new Date(comment.createdAt).toLocaleString()}
          >
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </span>
          {comment.editedAt && (
            <span className="text-xs text-muted-foreground">(edited)</span>
          )}
          <button
            className={`text-xs ${hasLiked ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => toggleLike.mutate({ commentId: comment.id })}
            disabled={toggleLike.isPending}
          >
            {hasLiked ? "♥" : "♡"}{likeCount > 0 && ` ${likeCount}`}
          </button>
          {isOwn && !editing && (
            <>
              <button
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
              <button
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={() => deleteComment.mutate({ id: comment.id })}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function PostCard({
  post,
  currentUserId,
  isGroupAdmin,
  onRefresh,
}: {
  post: PostData;
  currentUserId: string;
  /** Whether the current user is an admin/owner of the group this post belongs to */
  isGroupAdmin?: boolean;
  onRefresh: () => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentImage, setCommentImage] = useState<CommentImageUpload | null>(null);
  const [commentImageUploading, setCommentImageUploading] = useState(false);
  const commentFileInputRef = useRef<HTMLInputElement>(null);
  const [editingPost, setEditingPost] = useState(false);
  const [editPostBody, setEditPostBody] = useState(post.body ?? "");
  const postTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Optimistic like state — single atom avoids stale-closure issues when
  // setOptimisticLike uses the functional updater form.
  // null = show server data; non-null = show optimistic override.
  const [optimisticLike, setOptimisticLike] = useState<{ liked: boolean; count: number } | null>(null);

  // Optimistic comments — extra entries appended before the server confirms.
  const [optimisticComments, setOptimisticComments] = useState<CommentData[]>([]);

  const serverLiked = post.reactions.some((r) => r.userId === currentUserId && r.type === "like");
  const serverLikeCount = post.reactions.filter((r) => r.type === "like").length;

  // Reset optimistic overrides when server data arrives (reactions array changed).
  useEffect(() => { setOptimisticLike(null); }, [post.reactions]);
  useEffect(() => { setOptimisticComments([]); }, [post.comments]);

  const hasLiked = optimisticLike?.liked ?? serverLiked;
  const likeCount = optimisticLike?.count ?? serverLikeCount;
  const allComments = [...post.comments, ...optimisticComments];
  const commentCount = allComments.length;

  const toggleLike = api.feed.toggleLike.useMutation({
    onMutate: () => {
      // Functional updater reads the latest state atomically — no stale closure.
      setOptimisticLike((prev) => {
        const currentLiked = prev?.liked ?? serverLiked;
        const currentCount = prev?.count ?? serverLikeCount;
        return { liked: !currentLiked, count: currentCount + (currentLiked ? -1 : 1) };
      });
    },
    onError: () => {
      setOptimisticLike(null);
      onRefresh();
    },
    onSuccess: onRefresh,
  });

  const deletePost = api.feed.delete.useMutation({
    onSuccess: () => { setEditingPost(false); onRefresh(); },
  });
  const editPostMutation = api.feed.editPost.useMutation({
    onSuccess: () => { setEditingPost(false); onRefresh(); },
  });
  const pinPost = api.feed.pinPost.useMutation({ onSuccess: onRefresh });
  const blockUser = api.friends.block.useMutation({ onSuccess: onRefresh });

  const addComment = api.feed.comment.useMutation({
    onMutate: ({ body }) => {
      // Capture the current textarea value so we can restore it if the mutation fails.
      const previousBody = commentBody;
      // Append a temporary comment so the user sees it immediately.
      // "You" is a placeholder — replaced by the real author name once onRefresh runs.
      const optimistic: CommentData = {
        id: `optimistic-${crypto.randomUUID()}`,
        body,
        imageUrls: null,
        createdAt: new Date(),
        editedAt: null,
        deletedAt: null,
        author: { id: currentUserId, name: "You", username: null, image: null },
        reactions: [],
      };
      setCommentBody("");
      setOptimisticComments((prev) => [...prev, optimistic]);
      return { previousBody };
    },
    onError: (_err, _vars, context) => {
      // Restore the textarea text and remove the optimistic entry.
      setCommentBody(context?.previousBody ?? "");
      setOptimisticComments([]);
      onRefresh();
    },
    onSuccess: () => {
      setOptimisticComments([]);
      onRefresh();
    },
  });

  useEffect(() => {
    if (editingPost) postTextareaRef.current?.focus();
  }, [editingPost]);

  // Sync editPostBody if post body changes from a refetch while not editing
  useEffect(() => {
    if (!editingPost) setEditPostBody(post.body ?? "");
  }, [post.body, editingPost]);

  function cancelPostEdit() {
    setEditingPost(false);
    setEditPostBody(post.body ?? "");
  }

  function handleCommentFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    // Abort any in-flight upload for the previous image
    commentImage?.abort.abort();
    if (commentImage) URL.revokeObjectURL(commentImage.preview);

    const img: CommentImageUpload = {
      uploadId: createId(),
      file,
      preview: URL.createObjectURL(file),
      key: null,
      error: (() => {
        if (!ALLOWED_TYPES.includes(file.type)) return `Unsupported type "${file.type}"`;
        const limit = file.type === "image/gif" ? GIF_MAX_IMAGE_BYTES : MAX_IMAGE_BYTES;
        if (file.size > limit) return `File too large (max ${limit / 1024 / 1024} MB)`;
        return null;
      })(),
      abort: new AbortController(),
    };
    setCommentImage(img);
    if (!img.error) void uploadCommentImage(img);
  }

  async function uploadCommentImage(img: CommentImageUpload) {
    setCommentImageUploading(true);
    const fd = new FormData();
    fd.append("file", img.file);
    fd.append("postId", img.uploadId);
    try {
      const res = await fetch("/api/upload/post-image", { method: "POST", body: fd, signal: img.abort.signal });
      const json = (await res.json()) as { key?: string; error?: string };
      setCommentImage((prev) =>
        prev?.uploadId === img.uploadId
          ? { ...prev, key: json.key ?? null, error: json.error ?? (json.key ? null : "Upload failed") }
          : prev
      );
    } catch {
      if (img.abort.signal.aborted) return;
      setCommentImage((prev) =>
        prev?.uploadId === img.uploadId ? { ...prev, error: "Upload failed. Try again." } : prev
      );
    } finally {
      setCommentImageUploading(false);
    }
  }

  function removeCommentImage() {
    commentImage?.abort.abort();
    if (commentImage) URL.revokeObjectURL(commentImage.preview);
    setCommentImage(null);
  }

  const isOwn = post.author.id === currentUserId;
  // Filter out null slots (unprocessed by worker) and any malformed URLs.
  // next/image calls new URL(src) internally — non-absolute or empty strings throw.
  const imageUrls = (post.imageUrls ?? []).filter((u): u is string => {
    if (!u) return false;
    try { new URL(u); return true; } catch { return false; }
  });

  return (
    <article className={cn("space-y-3 rounded-lg border p-4", post.pinnedAt && "border-primary/40 bg-primary/5")}>
      {/* Pinned indicator */}
      {post.pinnedAt && (
        <p className="text-xs font-medium text-primary">📌 Pinned</p>
      )}
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Avatar className="h-9 w-9">
            <AvatarImage src={post.author.image ?? undefined} />
            <AvatarFallback>{initials(post.author.name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium leading-none">{post.author.name}</p>
            <p className="text-xs text-muted-foreground">
              {post.author.username ? `@${post.author.username} · ` : ""}
              {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
              {post.editedAt && <span className="ml-1">(edited)</span>}
              {post.group && (
                <> · <span className="font-medium">{post.group.name}</span></>
              )}
              {post.event && (
                <> · <span className="font-medium">{post.event.title}</span></>
              )}
            </p>
          </div>
        </div>
        {isOwn ? (
          <div className="flex gap-2">
            {!editingPost && (
              <>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setEditingPost(true)}
                >
                  Edit
                </button>
                <button
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => deletePost.mutate({ id: post.id })}
                >
                  Delete
                </button>
              </>
            )}
            {isGroupAdmin && post.group && !editingPost && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => pinPost.mutate({ id: post.id })}
                disabled={pinPost.isPending}
              >
                {post.pinnedAt ? "Unpin" : "Pin"}
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            {isGroupAdmin && post.group && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => pinPost.mutate({ id: post.id })}
                disabled={pinPost.isPending}
              >
                {post.pinnedAt ? "Unpin" : "Pin"}
              </button>
            )}
            <button
              className="text-xs text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (window.confirm(`Block ${post.author.name}? Their posts will be hidden from your feed.`)) {
                  blockUser.mutate({ targetId: post.author.id });
                }
              }}
              disabled={blockUser.isPending}
            >
              Block
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      {editingPost ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = editPostBody.trim();
            if (trimmed && trimmed !== post.body) {
              editPostMutation.mutate({ id: post.id, body: trimmed });
            } else {
              cancelPostEdit();
            }
          }}
          className="flex gap-2"
        >
          <Textarea
            ref={postTextareaRef}
            value={editPostBody}
            onChange={(e) => setEditPostBody(e.target.value)}
            className="resize-none text-sm"
            rows={3}
            onKeyDown={(e) => { if (e.key === "Escape") cancelPostEdit(); }}
          />
          <div className="flex flex-col gap-1">
            <Button type="submit" size="sm" disabled={!editPostBody.trim() || editPostMutation.isPending}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={cancelPostEdit}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        post.body && <p className="text-sm whitespace-pre-wrap">{post.body}</p>
      )}

      {/* Images — null slots (unprocessed by worker) already filtered out above */}
      {imageUrls.length > 0 && (
        <div className={`grid gap-1 ${imageUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {imageUrls.map((url, i) => (
            <Image
              key={i}
              src={url}
              alt=""
              width={0}
              height={0}
              sizes={imageUrls.length === 1 ? "100vw" : "50vw"}
              className="w-full rounded object-cover"
              style={{
                height: "auto",
                maxHeight: imageUrls.length === 1 ? "400px" : "200px",
              }}
              unoptimized={isGifUrl(url)}
            />
          ))}
        </div>
      )}

      {/* Embed: YouTube iframe or rich link preview card */}
      {post.embedMetadata && (
        post.embedMetadata.type === "youtube" && post.embedMetadata.videoId ? (
          <div className="overflow-hidden rounded-lg border aspect-video">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${post.embedMetadata.videoId}`}
              title={post.embedMetadata.title ?? "YouTube video"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
              className="w-full h-full"
            />
          </div>
        ) : (
          <a
            href={post.embedMetadata.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-lg border hover:bg-muted/50 transition-colors"
          >
            {post.embedMetadata.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.embedMetadata.thumbnailUrl}
                alt=""
                className="w-full aspect-video object-cover"
              />
            )}
            <div className="px-3 py-2 space-y-0.5">
              {post.embedMetadata.title && (
                <p className="text-sm font-medium line-clamp-2">{post.embedMetadata.title}</p>
              )}
              {post.embedMetadata.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{post.embedMetadata.description}</p>
              )}
              <p className="text-xs text-muted-foreground truncate">{post.embedMetadata.url}</p>
            </div>
          </a>
        )
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 border-t pt-2">
        <button
          className={`flex items-center gap-1 text-sm ${hasLiked ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => toggleLike.mutate({ postId: post.id })}
          disabled={toggleLike.isPending}
        >
          {hasLiked ? "♥" : "♡"} {likeCount > 0 && likeCount}
        </button>
        <button
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setShowComments((v) => !v)}
        >
          💬 {commentCount > 0 && commentCount}
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="space-y-3 border-t pt-3">
          {allComments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              currentUserId={currentUserId}
              onRefresh={onRefresh}
            />
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!commentBody.trim()) return;
              addComment.mutate({
                postId: post.id,
                body: commentBody.trim(),
                imageKeys: commentImage?.key ? [commentImage.key] : undefined,
              });
              removeCommentImage();
            }}
            className="space-y-2"
          >
            {commentImage && (
              <div className="relative h-20 w-20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={commentImage.preview} alt="" className="h-full w-full rounded object-cover" />
                {commentImage.key === null && !commentImage.error && (
                  <div className="absolute inset-0 flex items-center justify-center rounded bg-black/50 text-xs text-white">
                    Uploading…
                  </div>
                )}
                {commentImage.error && (
                  <div className="absolute inset-0 flex items-center justify-center rounded bg-destructive/80 p-1 text-center text-xs text-white leading-tight">
                    {commentImage.error}
                  </div>
                )}
                <button
                  type="button"
                  aria-label="Remove image"
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border bg-background text-xs text-muted-foreground hover:text-destructive"
                  onClick={removeCommentImage}
                >
                  ×
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <Textarea
                placeholder="Write a comment…"
                rows={1}
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                className="min-h-0 resize-none"
              />
              <div className="flex flex-col gap-1">
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    !commentBody.trim() ||
                    addComment.isPending ||
                    commentImageUploading ||
                    (commentImage !== null && commentImage.key === null && !commentImage.error)
                  }
                >
                  Send
                </Button>
                {!commentImage && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => commentFileInputRef.current?.click()}
                  >
                    + Photo
                  </button>
                )}
                <input
                  ref={commentFileInputRef}
                  type="file"
                  accept={ALLOWED_TYPES.join(",")}
                  className="hidden"
                  onChange={handleCommentFileChange}
                />
              </div>
            </div>
          </form>
        </div>
      )}
    </article>
  );
}
