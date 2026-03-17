"use client";

import { usePathname } from "next/navigation";
import { api } from "@/trpc/react";
import { UpcomingEventsPanel } from "@/components/feed/upcoming-events-panel";

// Pages where the right panel adds no contextual value.
const HIDDEN_ON = ["/settings", "/notifications", "/people"];

export function RightPanel() {
  const pathname = usePathname();
  const hidden = HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Pre-fetch here so we can suppress the whole aside when there are no events.
  // UpcomingEventsPanel uses the same query key so this result is shared from cache.
  const { data: upcoming, isLoading } = api.events.upcoming.useQuery(
    { limit: 3 },
    { enabled: !hidden }
  );

  // Hide entirely when: explicitly hidden page, or loaded with no events.
  if (hidden) return null;
  if (!isLoading && (!upcoming || upcoming.length === 0)) return null;

  return (
    <aside className="hidden xl:flex xl:flex-col w-52 shrink-0 sticky top-0 h-screen overflow-y-auto py-6 px-4 border-l bg-card">
      <UpcomingEventsPanel />
    </aside>
  );
}
