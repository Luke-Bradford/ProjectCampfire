"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

type PostAuthor = { id: string; name: string; username: string | null; image: string | null };
type CommentData = {
  id: string;
  body: string;
  createdAt: Date;
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
  author: PostAuthor;
  group: { id: string; name: string } | null;
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
  const deleteComment = api.feed.deleteComment.useMutation({ onSuccess: onRefresh });
  const toggleLike = api.feed.toggleLike.useMutation({ onSuccess: onRefresh });

  const likeCount = comment.reactions.filter((r) => r.type === "like").length;
  const hasLiked = comment.reactions.some((r) => r.userId === currentUserId);

  return (
    <div className="flex gap-2">
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarImage src={comment.author.image ?? undefined} />
        <AvatarFallback className="text-xs">{initials(comment.author.name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-0.5">
        <p className="px-1 text-xs font-medium">{comment.author.name}</p>
        <div className="rounded-lg bg-muted px-3 py-2 text-sm">
          {comment.body}
        </div>
        <div className="flex items-center gap-2 px-1">
          <span
            className="text-xs text-muted-foreground"
            title={new Date(comment.createdAt).toLocaleString()}
          >
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </span>
          <button
            className={`text-xs ${hasLiked ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => toggleLike.mutate({ commentId: comment.id })}
            disabled={toggleLike.isPending}
          >
            {hasLiked ? "♥" : "♡"}{likeCount > 0 && ` ${likeCount}`}
          </button>
          {comment.author.id === currentUserId && (
            <button
              className="text-xs text-muted-foreground hover:text-destructive"
              onClick={() => deleteComment.mutate({ id: comment.id })}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function PostCard({
  post,
  currentUserId,
  onRefresh,
}: {
  post: PostData;
  currentUserId: string;
  onRefresh: () => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [commentBody, setCommentBody] = useState("");

  const toggleLike = api.feed.toggleLike.useMutation({ onSuccess: onRefresh });
  const deletePost = api.feed.delete.useMutation({ onSuccess: onRefresh });
  const blockUser = api.friends.block.useMutation({ onSuccess: onRefresh });
  const addComment = api.feed.comment.useMutation({
    onSuccess: () => {
      setCommentBody("");
      onRefresh();
    },
  });

  const likeCount = post.reactions.filter((r) => r.type === "like").length;
  const hasLiked = post.reactions.some((r) => r.userId === currentUserId);
  const commentCount = post.comments.length;

  return (
    <article className="space-y-3 rounded-lg border p-4">
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
              {post.group && (
                <> · <span className="font-medium">{post.group.name}</span></>
              )}
            </p>
          </div>
        </div>
        {post.author.id === currentUserId ? (
          <button
            className="text-xs text-muted-foreground hover:text-destructive"
            onClick={() => deletePost.mutate({ id: post.id })}
          >
            Delete
          </button>
        ) : (
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
        )}
      </div>

      {/* Body */}
      {post.body && <p className="text-sm whitespace-pre-wrap">{post.body}</p>}

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
