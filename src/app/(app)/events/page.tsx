"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { EventsListSkeleton, GroupsListSkeleton } from "@/components/ui/skeletons";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { format } from "date-fns";

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  open: "default",
  confirmed: "default",
  cancelled: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  open: "Open",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

// ── Create event dialog ───────────────────────────────────────────────────────

function CreateEventDialog({
  groupId,
  onCreated,
}: {
  groupId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const create = api.events.create.useMutation({
    onSuccess: () => {
      setOpen(false);
      setTitle("");
      setDescription("");
      onCreated();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New event</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create event</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            create.mutate({ groupId, title, description: description || undefined });
          }}
          className="space-y-4"
        >
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              placeholder="e.g. Friday Night Session"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-desc">Description (optional)</Label>
            <Input
              id="event-desc"
              placeholder="What are you planning?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || create.isPending}>
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Events list for a group ───────────────────────────────────────────────────

function GroupEvents({ groupId, groupName }: { groupId: string; groupName: string }) {
  const { data: eventList = [], isLoading, refetch } = api.events.list.useQuery({ groupId });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{groupName}</h2>
        <CreateEventDialog groupId={groupId} onCreated={() => void refetch()} />
      </div>
      {isLoading ? (
        <EventsListSkeleton />
      ) : eventList.length === 0 ? (
        <EmptyState
          icon={
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
          heading="No events yet"
          description="Use the button above to propose a session and find a time that works for everyone."
          className="py-8"
        />
      ) : (
        <ul className="space-y-2">
          {eventList.map((ev) => {
            const myRsvp = ev.rsvps.find((r) => r.status === "yes")?.status;
            return (
              <li key={ev.id}>
                <Link
                  href={`/events/${ev.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{ev.title}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANT[ev.status]} className="text-xs">
                        {STATUS_LABEL[ev.status]}
                      </Badge>
                      {ev.confirmedStartsAt && (
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(ev.confirmedStartsAt), "d MMM, HH:mm")}
                        </span>
                      )}
                      {ev.polls.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {ev.polls.length} poll{ev.polls.length === 1 ? "" : "s"}
                        </span>
                      )}
                      {ev.gameOptional && (
                        <span className="text-xs text-muted-foreground">Game optional</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {ev.rsvps.length} RSVP{ev.rsvps.length === 1 ? "" : "s"}
                    </span>
                    {myRsvp && (
                      <Badge variant="outline" className="text-xs">
                        Going
                      </Badge>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const { data: groups = [], isLoading: groupsLoading } = api.groups.list.useQuery();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const activeGroupId = selectedGroupId ?? groups[0]?.id ?? null;

  if (groupsLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Events</h1>
        <GroupsListSkeleton count={3} />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Events</h1>
        <EmptyState
          icon={
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
          heading="No groups yet"
          description="Join or create a group to start planning gaming sessions."
          action={
            <Button asChild size="sm">
              <Link href="/groups">Go to Groups</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Events</h1>

      {/* Group tabs */}
      {groups.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGroupId(g.id)}
              className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                activeGroupId === g.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {activeGroupId && (
        <GroupEvents
          groupId={activeGroupId}
          groupName={groups.find((g) => g.id === activeGroupId)?.name ?? ""}
        />
      )}
    </div>
  );
}
