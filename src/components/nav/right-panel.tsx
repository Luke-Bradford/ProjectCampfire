import { UpcomingEventsPanel } from "@/components/feed/upcoming-events-panel";

export function RightPanel() {
  return (
    <aside className="hidden lg:block w-60 shrink-0 sticky top-0 h-screen overflow-y-auto py-6 px-4 border-l">
      <UpcomingEventsPanel />
    </aside>
  );
}
