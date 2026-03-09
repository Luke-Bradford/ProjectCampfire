"use client";

import { api } from "@/trpc/react";
import { PostComposer } from "@/components/feed/post-composer";
import { PostCard } from "@/components/feed/post-card";

export default function FeedPage() {
  const { data: me } = api.user.me.useQuery();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } =
    api.feed.list.useInfiniteQuery(
      { limit: 20 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor }
    );

  const allItems = data?.pages.flatMap((p) => p.items) ?? [];
  const isEmpty = !isLoading && allItems.length === 0;

  function refresh() {
    void refetch();
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <PostComposer onPosted={refresh} />

      {isLoading && <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>}

      {isEmpty && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing here yet. Add some friends or post something!
          </p>
        </div>
      )}

      {allItems.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          currentUserId={me?.id ?? ""}
          onRefresh={refresh}
        />
      ))}

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <button
            className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
