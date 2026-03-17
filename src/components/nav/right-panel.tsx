"use client";

import { usePathname } from "next/navigation";
import { api } from "@/trpc/react";
import { UpcomingEventsPanel } from "@/components/feed/upcoming-events-panel";

// Pages where the right panel adds no contextual value.
const HIDDEN_ON = ["/settings", "/notifications", "/people"];

export function RightPanel() {
  const pathname = usePathname();
  const hidden = HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Pre-fetch so we can suppress the entire aside when there are no events.
  // UpcomingEventsPanel uses the same query key — result is served from cache.
  const { data: upcoming, isLoading } = api.events.upcoming.useQuery(
    { limit: 3 },
    { enabled: !hidden }
  );

  if (hidden) return null;
  // Keep the column while loading to avoid layout shift; hide once confirmed empty.
  if (!isLoading && (!upcoming || upcoming.length === 0)) return null;

  return (
    <aside className="hidden xl:block w-60 shrink-0 sticky top-0 h-screen overflow-y-auto py-4 px-3">
      <UpcomingEventsPanel />
    </aside>
  );
}
