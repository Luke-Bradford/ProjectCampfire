"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { api } from "@/trpc/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

function formatEventDate(date: Date | null) {
  if (!date) return null;
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 0) return null;
  if (diffHours < 24) return "Today";
  if (diffHours < 48) return "Tomorrow";

  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const RSVP_LABELS: Record<string, string> = {
  yes: "Going",
  no: "Not going",
  maybe: "Maybe",
};

export function UpcomingEventsPanel() {
  const { data: upcoming, isLoading } = api.events.upcoming.useQuery({ limit: 3 });

  // Don't render the panel at all while loading or when there are no upcoming events —
  // an empty right column looks unfinished and wastes space.
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 px-1 pt-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (!upcoming || upcoming.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 px-1">
        <CalendarDays size={12} />
        Upcoming
      </h2>

      <div className="flex flex-col divide-y divide-border/60">
        {upcoming.map((event) => {
          const dateLabel = formatEventDate(event.confirmedStartsAt);
          const isImminent = dateLabel === "Today";
          const myRsvp = event.rsvps[0]?.status;

          return (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 group"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium leading-tight group-hover:text-primary transition-colors line-clamp-2">
                  {event.title}
                </p>
                {isImminent && (
                  <Badge variant="outline" className="text-[10px] shrink-0 border-primary text-primary">
                    Today
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground truncate">
                  {event.group.name}
                </span>
                {dateLabel && !isImminent && (
                  <>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{dateLabel}</span>
                  </>
                )}
                {myRsvp && (
                  <>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className={`text-xs font-medium ${myRsvp === "yes" ? "text-green-600 dark:text-green-400" : myRsvp === "no" ? "text-muted-foreground" : "text-yellow-600 dark:text-yellow-400"}`}>
                      {RSVP_LABELS[myRsvp]}
                    </span>
                  </>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <Link
        href="/events"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
      >
        View all →
      </Link>
    </div>
  );
}
