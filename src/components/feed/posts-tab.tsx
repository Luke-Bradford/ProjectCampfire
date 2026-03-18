"use client";

import Link from "next/link";
import { api } from "@/trpc/react";
import { PostCard } from "@/components/feed/post-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";

/** Renders a cursor-paginated list of posts by `userId`, visible to the current user. */
export function PostsTab({ userId, currentUserId, isOwnProfile = false }: { userId: string; currentUserId: string; isOwnProfile?: boolean }) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    api.feed.listForUser.useInfiniteQuery(
      { userId, limit: 10 },
      { getNextPageParam: (p) => p.nextCursor }
    );

  const posts = data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border bg-card shadow-sm p-8 flex flex-col items-center gap-3 text-center">
        <FileText size={32} className="text-muted-foreground" />
        {isOwnProfile ? (
          <>
            <p className="text-sm text-muted-foreground">You haven&apos;t posted anything yet.</p>
            <Link href="/feed" className="text-xs text-primary hover:underline">
              Share something with your groups →
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No posts yet.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          currentUserId={currentUserId}
          onRefresh={() => void refetch()}
        />
      ))}
      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
