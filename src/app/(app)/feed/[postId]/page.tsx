"use client";

import { use } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";
import { PostCard } from "@/components/feed/post-card";
import { FeedSkeleton } from "@/components/ui/skeletons";

export default function PostPermalinkPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = use(params);
  const { data: me, isLoading: meLoading } = api.user.me.useQuery();
  const { data: post, isLoading: postLoading, refetch } = api.feed.getPost.useQuery({ id: postId });

  if (postLoading || meLoading) return <FeedSkeleton />;

  if (!post || !me) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Link href="/feed" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to feed
        </Link>
        <p className="text-muted-foreground">
          This post doesn&apos;t exist or you don&apos;t have access to it.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Link href="/feed" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to feed
      </Link>
      <PostCard
        post={post}
        currentUserId={me.id}
        onRefresh={() => void refetch()}
      />
    </div>
  );
}
