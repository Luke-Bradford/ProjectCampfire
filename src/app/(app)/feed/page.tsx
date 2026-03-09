"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/trpc/react";
import { PostComposer } from "@/components/feed/post-composer";
import { PostCard } from "@/components/feed/post-card";

type FeedItem = Parameters<typeof PostCard>[0]["post"];

export default function FeedPage() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allItems, setAllItems] = useState<FeedItem[]>([]);
  const isLoadMore = useRef(false);

  const { data: me } = api.user.me.useQuery();
  const { data, refetch, isLoading, isFetching } = api.feed.list.useQuery({ limit: 20, cursor });

  useEffect(() => {
    if (!data) return;
    if (isLoadMore.current) {
      setAllItems((prev) => [...prev, ...data.items]);
    } else {
      setAllItems(data.items);
    }
    isLoadMore.current = false;
  }, [data]);

  function refresh() {
    isLoadMore.current = false;
    setCursor(undefined);
    void refetch();
  }

  function loadMore() {
    if (!data?.nextCursor) return;
    isLoadMore.current = true;
    setCursor(data.nextCursor);
  }

  const isEmpty = !isLoading && allItems.length === 0;

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

      {data?.nextCursor && (
        <div className="flex justify-center pt-2">
          <button
            className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={isFetching}
            onClick={loadMore}
          >
            {isFetching ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
