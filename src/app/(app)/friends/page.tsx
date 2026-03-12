"use client";

import Link from "next/link";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { FriendsListSkeleton } from "@/components/ui/skeletons";

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function FriendsPage() {
  const { data, isLoading, refetch } = api.friends.list.useQuery();

  const remove = api.friends.remove.useMutation({
    onSuccess: () => void refetch(),
  });

  const friends = data?.friends ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Friends</h1>
          <p className="text-muted-foreground">
            {friends.length === 0 ? "No friends yet." : `${friends.length} friend${friends.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/people">Find people</Link>
        </Button>
      </div>

      {isLoading ? (
        <FriendsListSkeleton />
      ) : friends.length === 0 ? (
        <EmptyState
          icon={
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
          heading="No friends yet"
          description="Search for people by username to connect."
          action={
            <Button asChild size="sm">
              <Link href="/people">Find people</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {friends.map((u) => (
            <li key={u.id} className="flex items-center justify-between rounded-lg border p-3">
              <Link
                href={u.username ? `/u/${u.username}` : "#"}
                className="flex items-center gap-3 hover:opacity-80"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={u.image ?? undefined} />
                  <AvatarFallback>{initials(u.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  {u.username && (
                    <p className="text-xs text-muted-foreground">@{u.username}</p>
                  )}
                </div>
              </Link>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => remove.mutate({ friendId: u.id })}
                disabled={remove.isPending}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
