"use client";

import { usePathname } from "next/navigation";
import { api } from "@/trpc/react";
import { UpcomingEventsPanel } from "@/components/feed/upcoming-events-panel";

// Pages where the right panel adds no contextual value.
const HIDDEN_ON = ["/settings", "/notifications", "/people"];

export function RightPanel() {
  const pathname = usePathname();
  const hidden = HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Single query — result passed as props to UpcomingEventsPanel to avoid
  // duplicate fetches and ensure both components share the same data snapshot.
  const { data: upcoming, isLoading } = api.events.upcoming.useQuery(
    { limit: 5 },
    { enabled: !hidden }
  );

  // Always render the aside so its w-60 width is always reserved — prevents the
  // centre column from shifting when events load in or when navigating between
  // pages where the panel is hidden.
  return (
    <aside className="hidden xl:block w-60 shrink-0 sticky top-0 h-screen overflow-y-auto py-4 px-3">
      {!hidden && !isLoading && upcoming && upcoming.length > 0 && (
        <UpcomingEventsPanel upcoming={upcoming} />
      )}
    </aside>
  );
}
