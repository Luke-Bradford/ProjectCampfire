"use client";

import { Gamepad2, Clock, TrendingUp } from "lucide-react";

function formatPlaytime(minutes: number): string {
  const total = Math.round(Math.abs(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

type MostPlayedEntry = {
  gameId: string;
  title: string;
  coverUrl: string | null;
  playtimeMinutes: number;
};

type RecentEntry = {
  appId: number;
  name: string;
  playtime2weeks: number;
};

export type GamingStats = {
  steamLinked: boolean;
  libraryPublic: boolean;
  totalMinutes: number;
  last2WeeksMinutes: number;
  mostPlayed: MostPlayedEntry[];
  recentlyPlayed: RecentEntry[];
};

export function GamingActivityCard({ stats }: { stats: GamingStats }) {
  if (!stats.steamLinked || !stats.libraryPublic) return null;

  return (
    <div className="rounded-xl border bg-card shadow-sm p-4 space-y-4">
      <p className="text-sm font-semibold">Gaming Activity</p>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/50 p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock size={13} />
            <span className="text-xs font-medium">Total playtime</span>
          </div>
          <span className="text-lg font-bold tabular-nums">
            {stats.totalMinutes > 0 ? formatPlaytime(stats.totalMinutes) : "—"}
          </span>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <TrendingUp size={13} />
            <span className="text-xs font-medium">Last 2 weeks</span>
          </div>
          <span className="text-lg font-bold tabular-nums">
            {stats.last2WeeksMinutes > 0 ? formatPlaytime(stats.last2WeeksMinutes) : "—"}
          </span>
        </div>
      </div>

      {/* Most played */}
      {stats.mostPlayed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Most played</p>
          <div className="space-y-2">
            {stats.mostPlayed.map((g) => (
              <div key={g.gameId} className="flex items-center gap-3">
                <div className="h-8 w-6 rounded shrink-0 overflow-hidden bg-muted border">
                  {g.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.coverUrl} alt={g.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <Gamepad2 size={10} className="text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <span className="flex-1 text-sm truncate">{g.title}</span>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {formatPlaytime(g.playtimeMinutes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recently played */}
      {stats.recentlyPlayed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recently played</p>
          <div className="space-y-2">
            {stats.recentlyPlayed.map((g) => (
              <div key={g.appId} className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://cdn.akamai.steamstatic.com/steam/apps/${g.appId}/capsule_sm_120.jpg`}
                  alt={g.name}
                  className="h-8 w-6 rounded object-cover shrink-0 bg-muted border"
                />
                <span className="flex-1 text-sm truncate">{g.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {formatPlaytime(g.playtime2weeks)} this period
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
