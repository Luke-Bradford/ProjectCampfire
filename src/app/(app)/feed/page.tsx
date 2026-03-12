"use client";

import Link from "next/link";
import { api } from "@/trpc/react";
import { PostComposer } from "@/components/feed/post-composer";
import { PostCard } from "@/components/feed/post-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

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
        <EmptyState
          icon={
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          }
          heading="Your feed is empty"
          description="Add friends or join a group to see what's happening."
          action={
            <Button asChild size="sm">
              <Link href="/people">Find people</Link>
            </Button>
          }
          secondaryAction={
            <Button asChild size="sm" variant="outline">
              <Link href="/groups">Browse groups</Link>
            </Button>
          }
        />
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
