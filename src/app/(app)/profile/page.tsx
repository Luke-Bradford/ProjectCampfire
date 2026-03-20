"use client";

import Link from "next/link";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Layers, Gamepad2, ExternalLink, Settings, ChevronRight } from "lucide-react";
import { PostsTab } from "@/components/feed/posts-tab";
import { GamingActivityCard } from "@/components/profile/gaming-activity-card";
import { AvailabilitySummary } from "@/components/availability/availability-summary";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function StatCard({
  href,
  icon,
  label,
  count,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 rounded-xl border bg-card shadow-sm p-4 hover:shadow-md hover:border-primary/30 transition-all text-center"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-2xl font-bold tabular-nums">{count}</span>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
    </Link>
  );
}

const PLATFORM_LABELS: Record<string, string> = {
  pc: "PC",
  playstation: "PS",
  xbox: "Xbox",
  nintendo: "NS",
  other: "Other",
};

function GamesTab() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    api.games.myGames.useInfiniteQuery(
      { limit: 24 },
      { getNextPageParam: (p) => p.nextCursor }
    );

  const allGames = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
        ))}
      </div>
    );
  }

  if (allGames.length === 0) {
    return (
      <div className="rounded-xl border bg-card shadow-sm p-6 flex flex-col items-center gap-3 text-center">
        <Gamepad2 size={32} className="text-muted-foreground" />
        <div>
          <p className="font-semibold">No games yet</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Add games to your library to track what you own.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/games">
            <ExternalLink size={13} className="mr-1.5" />
            Add games
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} game{total === 1 ? "" : "s"} in your library
        </p>
        <Button asChild variant="ghost" size="sm" className="text-xs gap-1 h-7 px-2">
          <Link href="/games">
            Manage
            <ChevronRight size={12} />
          </Link>
        </Button>
      </div>

      {/* Cover grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {allGames.map((g) => (
          <Link
            key={g.id}
            href={`/games/${g.id}`}
            className="group relative flex flex-col gap-1"
            title={g.title}
          >
            {/* Cover art */}
            <div className="aspect-[3/4] rounded-lg overflow-hidden bg-muted border">
              {g.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={g.coverUrl}
                  alt={g.title}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Gamepad2 size={20} className="text-muted-foreground/40" />
                </div>
              )}
            </div>

            {/* Title */}
            <p className="text-[11px] leading-snug truncate text-muted-foreground group-hover:text-foreground transition-colors">
              {g.title}
            </p>

            {/* Platform badges */}
            <div className="flex flex-wrap gap-0.5">
              {g.platforms.map((p) => (
                <span
                  key={p}
                  className="text-[9px] font-medium px-1 py-0.5 rounded bg-muted text-muted-foreground leading-none"
                >
                  {PLATFORM_LABELS[p] ?? p}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>

      {/* Load more */}
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

export default function MyProfilePage() {
  const { data: me, isLoading: meLoading } = api.user.me.useQuery();
  const { data: stats, isLoading: statsLoading } = api.user.profileStats.useQuery();
  const { data: gamingStats, isLoading: gamingStatsLoading } = api.games.gamingStats.useQuery();
  const { data: schedule, isLoading: scheduleLoading } = api.availability.getSchedule.useQuery();

  const isLoading = meLoading || statsLoading;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="rounded-xl border bg-card shadow-sm p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          {isLoading ? (
            <Skeleton className="h-20 w-20 rounded-full shrink-0" />
          ) : (
            <Avatar className="h-20 w-20 shrink-0">
              <AvatarImage src={me?.image ?? undefined} />
              <AvatarFallback className="text-xl font-semibold">
                {me?.name ? initials(me.name) : "?"}
              </AvatarFallback>
            </Avatar>
          )}

          {/* Name + handle + bio */}
          <div className="flex-1 min-w-0 space-y-1">
            {isLoading ? (
              <>
                <Skeleton className="h-6 w-40 mb-2" />
                <Skeleton className="h-4 w-28" />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold leading-tight">{me?.name}</h1>
                  {me?.profileVisibility === "private" && (
                    <Badge variant="secondary" className="text-xs">Private</Badge>
                  )}
                </div>
                {me?.username && (
                  <p className="text-sm text-muted-foreground">@{me.username}</p>
                )}
                {me?.bio && (
                  <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap leading-relaxed">
                    {me.bio}
                  </p>
                )}
                {!me?.bio && (
                  <p className="text-sm text-muted-foreground/50 mt-2 italic">No bio yet.</p>
                )}
              </>
            )}
          </div>

          {/* Edit button */}
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href="/settings">
              <Settings size={14} className="mr-1.5" />
              Edit profile
            </Link>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
          <TabsTrigger value="posts" className="flex-1">Posts</TabsTrigger>
          <TabsTrigger value="games" className="flex-1">Games</TabsTrigger>
          <TabsTrigger value="availability" className="flex-1">Availability</TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="mt-4 space-y-5">
          {/* Stat cards */}
          {statsLoading ? (
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <StatCard href="/friends" icon={<Users size={18} />} label="Friends" count={stats?.friendCount ?? 0} />
              <StatCard href="/groups" icon={<Layers size={18} />} label="Groups" count={stats?.groupCount ?? 0} />
              <StatCard href="/games" icon={<Gamepad2 size={18} />} label="Games" count={stats?.gameCount ?? 0} />
            </div>
          )}

          {/* Steam section */}
          {!meLoading && (
            <div className="rounded-xl border bg-card shadow-sm p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Steam</p>
                <Button asChild variant="ghost" size="sm" className="text-xs h-7 px-2">
                  <Link href="/settings">Manage</Link>
                </Button>
              </div>
              {me?.steamId ? (
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-sm text-muted-foreground">Account linked</span>
                  {me.steamProfileUrl && (
                    <a
                      href={me.steamProfileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      View profile
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No Steam account linked.</p>
              )}
            </div>
          )}

          {/* Gaming stats — always shown with graceful fallbacks */}
          {!gamingStatsLoading && (
            <GamingActivityCard
              stats={gamingStats ?? { steamLinked: false, libraryPublic: false, totalMinutes: 0, last2WeeksMinutes: 0, mostPlayed: [], recentlyPlayed: [] }}
              campfireGameCount={stats?.gameCount}
              isOwn
            />
          )}
        </TabsContent>

        {/* ── Posts ── */}
        <TabsContent value="posts" className="mt-4">
          {me?.id && <PostsTab userId={me.id} currentUserId={me.id} />}
        </TabsContent>

        {/* ── Games ── */}
        <TabsContent value="games" className="mt-4">
          <GamesTab />
        </TabsContent>

        {/* ── Availability ── */}
        <TabsContent value="availability" className="mt-4">
          {scheduleLoading ? (
            <div className="rounded-xl border bg-card shadow-sm p-4 space-y-3">
              <div className="h-4 w-32 rounded bg-muted animate-pulse" />
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-4 w-7 rounded bg-muted animate-pulse" />
                    <div className="h-4 w-40 rounded-full bg-muted animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <AvailabilitySummary slots={schedule?.slots ?? {}} isOwn />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
