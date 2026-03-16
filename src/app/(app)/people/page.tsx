"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function PeoplePage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  const search = api.friends.search.useQuery(
    { query: submitted },
    { enabled: submitted.length > 0 }
  );

  const { data: friendData, refetch: refetchFriends } = api.friends.list.useQuery();

  const sendRequest = api.friends.sendRequest.useMutation({
    onSuccess: () => void refetchFriends(),
  });

  const respond = api.friends.respondToRequest.useMutation({
    onSuccess: () => void refetchFriends(),
  });

  const outgoingIds = new Set(friendData?.outgoing.map((u) => u.id) ?? []);
  const friendIds = new Set(friendData?.friends.map((u) => u.id) ?? []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(query.trim());
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Find people</h1>
        <p className="text-muted-foreground">Search for friends by username or display name.</p>
      </div>

      {/* Incoming requests */}
      {(friendData?.incoming ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Friend requests</h2>
          <ul className="space-y-2">
            {friendData!.incoming.map((u) => (
              <li key={u.id} className="flex items-center justify-between rounded-lg border p-3">
                <Link href={u.username ? `/u/${u.username}` : "#"} className="flex items-center gap-3 hover:opacity-80">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={u.image ?? undefined} />
                    <AvatarFallback>{initials(u.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{u.name}</p>
                    {u.username && <p className="text-xs text-muted-foreground">@{u.username}</p>}
                  </div>
                </Link>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => respond.mutate({ requesterId: u.id, accept: true })}
                    disabled={respond.isPending}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => respond.mutate({ requesterId: u.id, accept: false })}
                    disabled={respond.isPending}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Search */}
      <section className="space-y-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="Search by name or @username"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-sm"
          />
          <Button type="submit" disabled={!query.trim()} className="disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100">
            Search
          </Button>
        </form>

        {search.isFetching && <p className="text-sm text-muted-foreground">Searching…</p>}

        {search.data && search.data.length === 0 && (
          <p className="text-sm text-muted-foreground">No results for &ldquo;{submitted}&rdquo;.</p>
        )}

        {search.data && search.data.length > 0 && (
          <ul className="space-y-2">
            {search.data.map((u) => {
              const isFriend = friendIds.has(u.id);
              const isPending = outgoingIds.has(u.id);
              return (
                <li key={u.id} className="flex items-center justify-between rounded-lg border p-3">
                  <Link href={u.username ? `/u/${u.username}` : "#"} className="flex items-center gap-3 hover:opacity-80">
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
                  {isFriend ? (
                    <span className="text-xs text-muted-foreground">Friends</span>
                  ) : isPending ? (
                    <span className="text-xs text-muted-foreground">Request sent</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => sendRequest.mutate({ addresseeId: u.id })}
                      disabled={sendRequest.isPending}
                    >
                      Add friend
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
