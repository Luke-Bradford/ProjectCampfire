"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
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
import { useState } from "react";

// ── Types from router inference ───────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  open: "Open",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

const RSVP_LABELS = { yes: "Going", no: "Not going", maybe: "Maybe" } as const;
type RsvpStatus = keyof typeof RSVP_LABELS;

// ── Poll card ─────────────────────────────────────────────────────────────────

function PollCard({
  poll,
  myUserId,
  onVote,
}: {
  poll: {
    id: string;
    question: string;
    status: string;
    allowMultipleVotes: string;
    createdBy: string;
    options: {
      id: string;
      label: string;
      votes: { userId: string }[];
      startsAt?: Date | string | null;
      endsAt?: Date | string | null;
    }[];
  };
  myUserId: string;
  onVote: () => void;
}) {
  const vote = api.polls.vote.useMutation({ onSuccess: onVote });
  const closePoll = api.polls.close.useMutation({ onSuccess: onVote });

  const totalVotes = poll.options.reduce((s, o) => s + o.votes.length, 0);
  const isClosed = poll.status === "closed";
  const isCreator = poll.createdBy === myUserId;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{poll.question}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalVotes} vote{totalVotes === 1 ? "" : "s"} ·{" "}
            {poll.allowMultipleVotes === "true" ? "Multiple choice" : "Single choice"}
          </p>
        </div>
        {isClosed ? (
          <Badge variant="secondary" className="text-xs shrink-0">Closed</Badge>
        ) : (
          <Badge variant="default" className="text-xs shrink-0">Open</Badge>
        )}
      </div>

      <ul className="space-y-1.5">
        {poll.options.map((opt) => {
          const count = opt.votes.length;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          return (
            <li key={opt.id}>
              <button
                disabled={isClosed || vote.isPending}
                onClick={() => vote.mutate({ pollOptionId: opt.id })}
                className="w-full text-left"
              >
                <div className={`flex items-center justify-between text-sm mb-0.5 ${opt.votes.some((v) => v.userId === myUserId) ? "font-medium" : ""}`}>
                  <span>
                    {opt.label}
                    {opt.startsAt && (
                      <span className="text-muted-foreground ml-1.5">
                        {format(new Date(opt.startsAt), "d MMM HH:mm")}
                        {opt.endsAt && ` – ${format(new Date(opt.endsAt), "HH:mm")}`}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground text-xs ml-2 shrink-0">
                    {count} ({pct}%)
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {!isClosed && isCreator && (
        <button
          onClick={() => closePoll.mutate({ id: poll.id })}
          disabled={closePoll.isPending}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close poll
        </button>
      )}
    </div>
  );
}

// ── Create poll dialog ────────────────────────────────────────────────────────

function CreatePollDialog({ eventId, groupId, onCreated }: { eventId: string; groupId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [type, setType] = useState<"time_slot" | "game" | "custom">("custom");
  const [options, setOptions] = useState(["", ""]);
  const [error, setError] = useState("");

  const create = api.polls.create.useMutation({
    onSuccess: () => { setOpen(false); setQuestion(""); setOptions(["", ""]); onCreated(); },
    onError: (e) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const filtered = options.filter((o) => o.trim());
    if (filtered.length < 2) { setError("Need at least 2 options."); return; }
    create.mutate({
      eventId,
      groupId,
      type,
      question,
      options: filtered.map((label, i) => ({ label, sortOrder: i })),
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Add poll</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add poll</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="flex gap-2 flex-wrap">
              {(["custom", "time_slot", "game"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`rounded-md border px-3 py-1 text-sm transition-colors ${type === t ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  {t === "time_slot" ? "Time slot" : t === "game" ? "Game vote" : "Custom"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="poll-q">Question</Label>
            <Input id="poll-q" required value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. When works for everyone?" />
          </div>
          <div className="space-y-2">
            <Label>Options</Label>
            {options.map((opt, i) => (
              <Input key={i} value={opt} placeholder={`Option ${i + 1}`}
                onChange={(e) => setOptions(options.map((o, j) => j === i ? e.target.value : o))} />
            ))}
            <button type="button" onClick={() => setOptions([...options, ""])}
              className="text-xs text-muted-foreground hover:text-foreground">
              + Add option
            </button>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!question.trim() || create.isPending}>
              {create.isPending ? "Creating…" : "Create poll"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Event detail page ─────────────────────────────────────────────────────────

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const utils = api.useUtils();

  const { data: me } = api.user.me.useQuery();
  const { data: event, isLoading } = api.events.get.useQuery({ id });
  const upsertRsvp = api.events.upsertRsvp.useMutation({
    onSuccess: () => void utils.events.get.invalidate({ id }),
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmStart, setConfirmStart] = useState("");
  const [confirmEnd, setConfirmEnd] = useState("");
  const [statusError, setStatusError] = useState("");
  const updateStatus = api.events.updateStatus.useMutation({
    onSuccess: () => { void utils.events.get.invalidate({ id }); setConfirmOpen(false); },
    onError: (e) => setStatusError(e.message),
  });

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (!event) return <p className="text-muted-foreground text-sm">Event not found.</p>;

  const myUserId = me?.id ?? "";
  const yesCount = event.rsvps.filter((r) => r.status === "yes").length;
  const maybeCount = event.rsvps.filter((r) => r.status === "maybe").length;
  const noCount = event.rsvps.filter((r) => r.status === "no").length;
  const isEventCreator = event.createdBy.id === myUserId;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-foreground mb-2">
          ← Back
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{event.title}</h1>
            {event.description && <p className="text-muted-foreground mt-1">{event.description}</p>}
          </div>
          <Badge variant={event.status === "cancelled" ? "destructive" : event.status === "confirmed" ? "default" : "secondary"}>
            {STATUS_LABEL[event.status]}
          </Badge>
        </div>
        {event.confirmedStartsAt && (
          <p className="text-sm text-muted-foreground mt-2">
            {format(new Date(event.confirmedStartsAt), "EEEE d MMMM, HH:mm")}
            {event.confirmedEndsAt && ` – ${format(new Date(event.confirmedEndsAt), "HH:mm")}`}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Created by {event.createdBy.name}
        </p>
      </div>

      {/* RSVP */}
      {event.status !== "cancelled" && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Your RSVP</p>
          <div className="flex gap-2 flex-wrap">
            {(["yes", "no", "maybe"] as RsvpStatus[]).map((s) => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                disabled={upsertRsvp.isPending}
                onClick={() => upsertRsvp.mutate({ eventId: id, status: s })}
              >
                {RSVP_LABELS[s]}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {yesCount} going · {maybeCount} maybe · {noCount} not going
          </p>
        </div>
      )}

      {/* RSVP list */}
      {event.rsvps.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">RSVPs</p>
          <ul className="space-y-1">
            {event.rsvps.map((r) => (
              <li key={r.user.id} className="flex items-center gap-2 text-sm">
                <span>{r.user.name}</span>
                <Badge variant={r.status === "yes" ? "default" : r.status === "no" ? "destructive" : "secondary"} className="text-xs">
                  {RSVP_LABELS[r.status as RsvpStatus]}
                </Badge>
                {r.note && <span className="text-muted-foreground text-xs">· {r.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Polls */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Polls</p>
          {event.status !== "cancelled" && (
            <CreatePollDialog
              eventId={id}
              groupId={event.groupId}
              onCreated={() => void utils.events.get.invalidate({ id })}
            />
          )}
        </div>
        {event.polls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No polls yet.</p>
        ) : (
          event.polls.map((poll) => (
            <PollCard
              key={poll.id}
              poll={{ ...poll, createdBy: poll.createdBy }}
              myUserId={myUserId}
              onVote={() => void utils.events.get.invalidate({ id })}
            />
          ))
        )}
      </div>

      {/* Status controls (for event creator) */}
      {isEventCreator && (event.status === "open" || event.status === "draft") && (
        <div className="border-t pt-4 space-y-2">
          <p className="text-sm font-medium">Event controls</p>
          {statusError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{statusError}</p>
          )}
          <div className="flex gap-2 flex-wrap">
            {event.status === "draft" && (
              <Button size="sm" onClick={() => { setStatusError(""); updateStatus.mutate({ id, status: "open" }); }} disabled={updateStatus.isPending}>
                Open for RSVPs
              </Button>
            )}
            {event.status === "open" && (
              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">Confirm event</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Confirm event time</DialogTitle></DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setStatusError("");
                      updateStatus.mutate({
                        id,
                        status: "confirmed",
                        confirmedStartsAt: confirmStart ? new Date(confirmStart).toISOString() : undefined,
                        confirmedEndsAt: confirmEnd ? new Date(confirmEnd).toISOString() : undefined,
                      });
                    }}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="confirm-start">Start time</Label>
                        <Input id="confirm-start" type="datetime-local" value={confirmStart} onChange={(e) => setConfirmStart(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm-end">End time (optional)</Label>
                        <Input id="confirm-end" type="datetime-local" value={confirmEnd} onChange={(e) => setConfirmEnd(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                      <Button type="submit" disabled={updateStatus.isPending}>
                        {updateStatus.isPending ? "Confirming…" : "Confirm"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            {event.status === "open" && (
              <Button size="sm" variant="destructive" onClick={() => { setStatusError(""); updateStatus.mutate({ id, status: "cancelled" }); }} disabled={updateStatus.isPending}>
                Cancel event
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
