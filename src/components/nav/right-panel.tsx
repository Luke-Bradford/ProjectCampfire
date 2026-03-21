"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { api } from "@/trpc/react";
import { UpcomingEventsPanel } from "@/components/feed/upcoming-events-panel";
import { OnlineFriendsWidget } from "@/components/nav/online-friends-widget";
import { ActivePollsWidget } from "@/components/nav/active-polls-widget";
import { RecentPollsWidget } from "@/components/nav/recent-polls-widget";

// Pages where the right panel adds no contextual value.
const HIDDEN_ON = ["/settings", "/notifications", "/people"];

export function RightPanel() {
  const pathname = usePathname();
  const hidden = HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Single query — result passed as props to UpcomingEventsPanel to avoid
  // duplicate fetches and ensure both components share the same data snapshot.
  const { data: upcoming, isLoading: eventsLoading } = api.events.upcoming.useQuery(
    { limit: 5 },
    { enabled: !hidden }
  );

  // Online friends — polled every 60 s to keep presence reasonably fresh
  // without hammering the server.
  const { data: onlineFriends, isLoading: friendsLoading } = api.friends.onlineFriends.useQuery(
    undefined,
    { enabled: !hidden, refetchInterval: 60_000 }
  );

  // Cross-group polls for sidebar
  const { data: sidebarPolls, isLoading: pollsLoading } = api.polls.forSidebar.useQuery(
    undefined,
    { enabled: !hidden }
  );

  // Always render the aside so its w-60 width is always reserved — prevents the
  // centre column from shifting when data loads or when navigating between pages
  // where the panel is hidden.
  return (
    <aside className="hidden xl:block w-60 shrink-0 sticky top-0 h-screen overflow-y-auto py-4 px-3 space-y-3">
      {/* ── Upcoming events ─────────────────────────────────────────────── */}
      {!hidden && !eventsLoading && upcoming && (
        upcoming.length > 0 ? (
          <UpcomingEventsPanel upcoming={upcoming} />
        ) : (
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <CalendarDays size={14} className="text-muted-foreground" />
              Upcoming events
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              No upcoming events yet.
            </p>
            <Link
              href="/events"
              className="text-xs text-primary hover:underline"
            >
              Browse or create an event →
            </Link>
          </div>
        )
      )}

      {/* ── Active polls ─────────────────────────────────────────────────── */}
      {!hidden && !pollsLoading && sidebarPolls && (
        <ActivePollsWidget polls={sidebarPolls.active} />
      )}

      {/* ── Recently closed polls ────────────────────────────────────────── */}
      {!hidden && !pollsLoading && sidebarPolls && (
        <RecentPollsWidget polls={sidebarPolls.recentlyClosed} />
      )}

      {/* ── Online friends ───────────────────────────────────────────────── */}
      {!hidden && !friendsLoading && onlineFriends && (
        <OnlineFriendsWidget friends={onlineFriends} />
      )}
    </aside>
  );
}
