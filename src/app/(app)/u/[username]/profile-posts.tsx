"use client";

import { PostsTab } from "@/components/feed/posts-tab";

export function ProfilePosts({ userId, currentUserId, isOwnProfile }: { userId: string; currentUserId: string; isOwnProfile: boolean }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Posts</h2>
      <PostsTab userId={userId} currentUserId={currentUserId} isOwnProfile={isOwnProfile} />
    </section>
  );
}
