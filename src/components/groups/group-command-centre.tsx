"use client";

import Link from "next/link";
import { format } from "date-fns";
import { CalendarDays, Vote, Users } from "lucide-react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusDot } from "@/components/ui/status-dot";

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

// ── Next session card ────────────────────────────────────────────────────────

function NextSessionCard({ groupId }: { groupId: string }) {
  const { data: event, isLoading } = api.events.nextForGroup.useQuery({ groupId });
  const utils = api.useUtils();

  const rsvp = api.events.upsertRsvp.useMutation({
    onSuccess: () => void utils.events.nextForGroup.invalidate({ groupId }),
  });

  if (isLoading || !event) return null;

  const dateLabel = event.confirmedStartsAt
    ? format(new Date(event.confirmedStartsAt), "EEE d MMM, HH:mm")
    : "Time TBD";

  return (
    <div className="rounded-xl border bg-card shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CalendarDays size={14} className="text-muted-foreground" />
        Next session
      </div>

      <div>
        <p className="font-medium truncate">{event.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{dateLabel}</p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {event.goingCount} going · {event.maybeCount} maybe
        </p>
        <div className="flex gap-1.5">
          {(["yes", "maybe", "no"] as const).map((status) => (
            <Button
              key={status}
              size="sm"
              variant={event.myRsvp === status ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              disabled={rsvp.isPending}
              onClick={() => rsvp.mutate({ eventId: event.id, status })}
            >
              {status === "yes" ? "Going" : status === "maybe" ? "Maybe" : "Can't"}
            </Button>
          ))}
          <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
            <Link href={`/events/${event.id}`}>Details</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Active poll card ─────────────────────────────────────────────────────────

function ActivePollCard({ groupId }: { groupId: string }) {
  const { data: poll, isLoading } = api.polls.activeForGroup.useQuery({ groupId });

  if (isLoading || !poll) return null;

  const pollHref = poll.eventId ? `/events/${poll.eventId}` : `/groups/${groupId}`;

  return (
    <div className="rounded-xl border bg-card shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Vote size={14} className="text-muted-foreground" />
        Active poll
      </div>
      <p className="text-sm truncate">{poll.question}</p>
      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
        <Link href={pollHref}>Vote now</Link>
      </Button>
    </div>
  );
}

// ── Members online strip ─────────────────────────────────────────────────────

type Member = {
  userId: string;
  user: {
    name: string;
    image: string | null;
    status: string | null;
    currentGameName: string | null;
  };
};

function OnlineStrip({ members }: { members: Member[] }) {
  const online = members.filter(
    (m) => m.user.currentGameName || m.user.status === "online" || m.user.status === "busy"
  );

  if (online.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card shadow-sm p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Users size={14} className="text-muted-foreground" />
        Online now
        <span className="text-xs font-normal text-muted-foreground">({online.length})</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {online.map((m) => (
          <div key={m.userId} className="relative group/avatar">
            <div className="relative">
              <Avatar className="h-8 w-8">
                <AvatarImage src={m.user.image ?? undefined} />
                <AvatarFallback className="text-xs">{initials(m.user.name)}</AvatarFallback>
              </Avatar>
              <StatusDot
                status={m.user.status as "online" | "offline" | "busy" | null}
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5"
              />
            </div>
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-10 hidden group-hover/avatar:block pointer-events-none">
              <div className="rounded bg-popover border shadow-sm px-2 py-1 text-xs text-popover-foreground whitespace-nowrap">
                <p className="font-medium">{m.user.name}</p>
                {m.user.currentGameName && (
                  <p className="text-green-500">Playing {m.user.currentGameName}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Command centre ────────────────────────────────────────────────────────────

interface GroupCommandCentreProps {
  groupId: string;
  members: Member[];
}

export function GroupCommandCentre({ groupId, members }: GroupCommandCentreProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <NextSessionCard groupId={groupId} />
      <ActivePollCard groupId={groupId} />
      <div className="sm:col-span-2">
        <OnlineStrip members={members} />
      </div>
    </div>
  );
}
