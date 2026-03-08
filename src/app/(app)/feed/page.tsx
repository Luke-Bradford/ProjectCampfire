"use client";

import { api } from "@/trpc/react";
import { PostComposer } from "@/components/feed/post-composer";
import { PostCard } from "@/components/feed/post-card";

export default function FeedPage() {
  const { data, refetch, isLoading } = api.feed.list.useQuery({ limit: 20 });
  const { data: me } = api.user.me.useQuery();

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <PostComposer onPosted={() => void refetch()} />

      {isLoading && <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>}

      {!isLoading && data?.items.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing here yet. Add some friends or post something!
          </p>
        </div>
      )}

      {data?.items.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          currentUserId={me?.id ?? ""}
          onRefresh={() => void refetch()}
        />
      ))}
    </div>
  );
}
