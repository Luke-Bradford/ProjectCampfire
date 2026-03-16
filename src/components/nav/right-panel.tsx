"use client";

import { usePathname } from "next/navigation";
import { UpcomingEventsPanel } from "@/components/feed/upcoming-events-panel";

// Pages where the right panel adds no contextual value.
const HIDDEN_ON = ["/settings", "/notifications", "/people"];

export function RightPanel() {
  const pathname = usePathname();
  const hidden = HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (hidden) return null;

  return (
    <aside className="hidden lg:block w-60 shrink-0 sticky top-0 h-screen overflow-y-auto py-6 px-4 border-l">
      <UpcomingEventsPanel />
    </aside>
  );
}
