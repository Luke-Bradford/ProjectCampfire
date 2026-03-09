"use client";

import { useState, useRef, useEffect } from "react";
import type { EmbedMetadata } from "@/server/db/schema/posts";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

type PostAuthor = { id: string; name: string; username: string | null; image: string | null };
type CommentData = {
  id: string;
  body: string;
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
          <div className="rounded-lg bg-muted px-3 py-2 text-sm">
            {comment.body}
          </div>
        )}
        <div className="flex items-center gap-2 px-1">
          <span
            className="text-xs text-muted-foreground"
            title={new Date(comment.createdAt).toLocaleString()}
          >
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
            {comment.editedAt && <span className="ml-1">(edited)</span>}
          </span>
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
  const [editingPost, setEditingPost] = useState(false);
  const [editPostBody, setEditPostBody] = useState(post.body ?? "");
  const postTextareaRef = useRef<HTMLTextAreaElement>(null);

  const toggleLike = api.feed.toggleLike.useMutation({ onSuccess: onRefresh });
  const deletePost = api.feed.delete.useMutation({
    onSuccess: () => { setEditingPost(false); onRefresh(); },
  });
  const editPostMutation = api.feed.editPost.useMutation({
    onSuccess: () => { setEditingPost(false); onRefresh(); },
  });
  const pinPost = api.feed.pinPost.useMutation({ onSuccess: onRefresh });
  const blockUser = api.friends.block.useMutation({ onSuccess: onRefresh });
  const addComment = api.feed.comment.useMutation({
    onSuccess: () => {
      setCommentBody("");
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

  const likeCount = post.reactions.filter((r) => r.type === "like").length;
  const hasLiked = post.reactions.some((r) => r.userId === currentUserId);
  const commentCount = post.comments.length;
  const isOwn = post.author.id === currentUserId;
  const imageUrls = (post.imageUrls ?? []).filter((u): u is string => u !== null);

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
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt=""
              className="w-full rounded object-cover"
              style={{ maxHeight: imageUrls.length === 1 ? "400px" : "200px" }}
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
          {post.comments.map((c) => (
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
              if (commentBody.trim()) addComment.mutate({ postId: post.id, body: commentBody.trim() });
            }}
            className="flex gap-2"
          >
            <Textarea
              placeholder="Write a comment…"
              rows={1}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              className="min-h-0 resize-none"
            />
            <Button type="submit" size="sm" disabled={!commentBody.trim() || addComment.isPending}>
              Send
            </Button>
          </form>
        </div>
      )}
    </article>
  );
}
