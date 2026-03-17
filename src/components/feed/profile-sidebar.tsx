"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { api, type RouterOutputs } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

type Me = NonNullable<RouterOutputs["user"]["me"]>;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const STEAM_ICON = (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current shrink-0 text-muted-foreground" aria-hidden="true">
    <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.718L.22 15.996C1.555 20.781 6.318 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.606 0 11.979 0z" />
  </svg>
);

function SteamBadge({ me }: { me: Me }) {
  const syncedAt = me.recentlyPlayedSyncedAt ? new Date(me.recentlyPlayedSyncedAt) : null;
  const isFresh = syncedAt && Date.now() - syncedAt.getTime() < SEVEN_DAYS_MS;

  // Runtime guard on the jsonb shape — $type<> is compile-time only
  const topGame = isFresh && Array.isArray(me.recentlyPlayedJson)
    ? (me.recentlyPlayedJson.find(
        (g) => typeof g?.name === "string" && typeof g?.playtime2weeks === "number"
      ) ?? null)
    : null;

  return (
    <div className="w-full rounded-md bg-muted px-3 py-1.5 space-y-1">
      <div className="flex items-center gap-2">
        {STEAM_ICON}
        <span className="text-xs text-muted-foreground truncate">Steam linked</span>
      </div>
      {topGame && (
        <p className="text-xs text-muted-foreground truncate pl-5">
          Playing: <span className="text-foreground font-medium">{topGame.name}</span>
          {topGame.playtime2weeks > 0 && (
            <span> · {Math.round(topGame.playtime2weeks / 60)}h this fortnight</span>
          )}
        </p>
      )}
    </div>
  );
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function StatItem({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-base font-semibold tabular-nums">
        {value ?? <Skeleton className="h-4 w-6 mt-0.5" />}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export function ProfileSidebar() {
  const { data: me } = api.user.me.useQuery();
  const { data: stats } = api.user.profileStats.useQuery();

  return (
    <aside className="flex flex-col gap-4">
      {/* Profile card */}
      <div className="rounded-xl border bg-card p-4 flex flex-col items-center gap-3">
        {me ? (
          <>
            <Link href={me.username ? `/u/${me.username}` : "/settings"} className="relative group">
              <Avatar className="h-16 w-16">
                <AvatarImage src={me.image ?? undefined} />
                <AvatarFallback className="text-lg">{initials(me.name)}</AvatarFallback>
              </Avatar>
            </Link>
            <div className="text-center">
              <p className="font-semibold text-sm leading-tight">{me.name}</p>
              {me.username && (
                <p className="text-xs text-muted-foreground mt-0.5">@{me.username}</p>
              )}
              {me.bio && (
                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-3">{me.bio}</p>
              )}
            </div>

            {/* Stats row */}
            <div className="w-full border-t pt-3 grid grid-cols-3 gap-2 text-center">
              <StatItem label="Friends" value={stats?.friendCount} />
              <StatItem label="Groups" value={stats?.groupCount} />
              <StatItem label="Games" value={stats?.gameCount} />
            </div>

            {/* Steam badge / recently played */}
            {me.steamId && <SteamBadge me={me} />}
          </>
        ) : (
          /* Loading skeleton */
          <>
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex flex-col items-center gap-1.5 w-full">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="w-full border-t pt-3 grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <Skeleton className="h-4 w-6" />
                  <Skeleton className="h-3 w-10" />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Quick links */}
      <div className="rounded-xl border bg-card px-3 py-2 flex flex-col gap-0.5">
        <Link
          href="/settings"
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Settings size={14} />
          Settings
        </Link>
      </div>
    </aside>
  );
}
