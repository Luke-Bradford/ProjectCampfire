"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { FriendsListSkeleton } from "@/components/ui/skeletons";
import { env } from "@/env";

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── Copy-invite button ─────────────────────────────────────────────────────────
// Creates a single-use 14-day invite link and copies it to the clipboard.

function CopyInviteButton({
  steamId,
  label = "Copy invite link",
}: {
  steamId?: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Clear the pending reset timer on unmount to avoid calling setState on an
  // unmounted component (e.g. user navigates away within 2.5s of clicking).
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  function scheduleReset() {
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState("idle"), 2500);
  }

  const createInvite = api.friends.createSteamInvite.useMutation({
    onSuccess: async ({ token }) => {
      const url = `${env.NEXT_PUBLIC_APP_URL}/invite/${token}`;
      try {
        await navigator.clipboard.writeText(url);
        setState("copied");
      } catch {
        setState("error");
      }
      scheduleReset();
    },
    onError: () => {
      setState("error");
      scheduleReset();
    },
  });

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={state === "loading"}
      onClick={() => {
        setState("loading");
        createInvite.mutate({ targetSteamId: steamId });
      }}
    >
      {state === "copied"
        ? "Copied!"
        : state === "error"
        ? "Error"
        : state === "loading"
        ? "Generating…"
        : label}
    </Button>
  );
}

// ── Steam friend suggestions ───────────────────────────────────────────────────

function SteamSuggestions() {
  const { data: suggestions, isLoading } = api.friends.steamSuggestions.useQuery();
  const utils = api.useUtils();
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [errorIds, setErrorIds] = useState<Map<string, string>>(new Map());

  const sendRequest = api.friends.sendRequest.useMutation({
    onSuccess: (_, vars) => {
      setSentTo((prev) => new Set(prev).add(vars.addresseeId));
      setPendingIds((prev) => { const s = new Set(prev); s.delete(vars.addresseeId); return s; });
      setErrorIds((prev) => { const m = new Map(prev); m.delete(vars.addresseeId); return m; });
      void utils.friends.list.invalidate();
    },
    onError: (err, vars) => {
      setPendingIds((prev) => { const s = new Set(prev); s.delete(vars.addresseeId); return s; });
      setErrorIds((prev) => new Map(prev).set(vars.addresseeId, err.message));
    },
  });

  // Don't render the section at all if there's nothing to show
  if (!isLoading && (!suggestions || suggestions.length === 0)) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Steam friends on Campfire
      </h2>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 animate-pulse">
              <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3 w-32 rounded bg-muted" />
                <div className="h-3 w-20 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {(suggestions ?? []).map((u) => (
            <li key={u.id} className="rounded-xl border bg-card shadow-sm px-4 py-3">
              <div className="flex items-center justify-between">
                <Link
                  href={u.username ? `/u/${u.username}` : "#"}
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={u.image ?? undefined} />
                    <AvatarFallback className="text-sm font-semibold">{initials(u.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium leading-tight">{u.name}</p>
                    {u.username && (
                      <p className="text-xs text-muted-foreground">@{u.username}</p>
                    )}
                  </div>
                </Link>
                <Button
                  size="sm"
                  variant={sentTo.has(u.id) ? "secondary" : errorIds.has(u.id) ? "outline" : "default"}
                  disabled={sentTo.has(u.id) || pendingIds.has(u.id)}
                  onClick={() => {
                    setPendingIds((prev) => new Set(prev).add(u.id));
                    setErrorIds((prev) => { const m = new Map(prev); m.delete(u.id); return m; });
                    sendRequest.mutate({ addresseeId: u.id });
                  }}
                >
                  {sentTo.has(u.id) ? "Sent" : pendingIds.has(u.id) ? "Sending…" : "Add friend"}
                </Button>
              </div>
              {errorIds.has(u.id) && (
                <p className="mt-1.5 text-xs text-destructive">{errorIds.get(u.id)}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function FriendsPage() {
  const { data, isLoading, refetch } = api.friends.list.useQuery();

  const remove = api.friends.remove.useMutation({
    onSuccess: () => void refetch(),
  });

  const friends = data?.friends ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Friends</h1>
          <p className="text-muted-foreground">
            {friends.length === 0 ? "No friends yet." : `${friends.length} friend${friends.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CopyInviteButton label="Invite a friend" />
          <Button asChild variant="outline">
            <Link href="/people">Find people</Link>
          </Button>
        </div>
      </div>

      <SteamSuggestions />

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
          description="Search for people by username or share an invite link."
          action={
            <Button asChild size="sm">
              <Link href="/people">Find people</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {friends.map((u) => (
            <li key={u.id} className="flex items-center justify-between rounded-xl border bg-card shadow-sm px-4 py-3">
              <Link
                href={u.username ? `/u/${u.username}` : "#"}
                className="flex items-center gap-3 hover:opacity-80 transition-opacity"
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={u.image ?? undefined} />
                  <AvatarFallback className="text-sm font-semibold">{initials(u.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium leading-tight">{u.name}</p>
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
