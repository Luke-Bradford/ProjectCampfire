"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PostComposer } from "@/components/feed/post-composer";
import { PostCard } from "@/components/feed/post-card";
import { GameSearchInput } from "@/components/games/game-search-input";
import { format } from "date-fns";

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
  groupId,
  myUserId,
  onVote,
}: {
  poll: {
    id: string;
    question: string;
    status: string;
    allowMultipleVotes: string;
    createdBy: string;
    type: string;
    options: {
      id: string;
      label: string;
      gameId?: string | null;
      votes: { userId: string; user: { name: string; image: string | null } }[];
      startsAt?: Date | string | null;
      endsAt?: Date | string | null;
    }[];
  };
  groupId: string;
  myUserId: string;
  onVote: () => void;
}) {
  const vote = api.polls.vote.useMutation({ onSuccess: onVote });
  const closePoll = api.polls.close.useMutation({ onSuccess: onVote });

  const totalVotes = poll.options.reduce((s, o) => s + o.votes.length, 0);
  const isClosed = poll.status === "closed";
  const isCreator = poll.createdBy === myUserId;

  // Winner = option(s) with the most votes (only relevant when closed)
  const maxVotes = isClosed ? Math.max(0, ...poll.options.map((o) => o.votes.length)) : 0;

  // Fetch ownership overlap for game polls (CAMP-104)
  const gameIds = poll.type === "game"
    ? poll.options.map((o) => o.gameId).filter((id): id is string => !!id)
    : [];
  const { data: ownershipMap } = api.games.ownershipOverlapBatch.useQuery(
    { gameIds, groupId },
    { enabled: gameIds.length > 0, staleTime: 60_000 }
  );

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
          const iVoted = opt.votes.some((v) => v.userId === myUserId);
          const isWinner = isClosed && count === maxVotes && count > 0;
          const owners = opt.gameId ? (ownershipMap?.[opt.gameId] ?? []) : [];
          const iOwn = owners.some((o) => o.user.id === myUserId);
          // Deduplicate owners by userId (a user may own on multiple platforms)
          const uniqueOwners = owners.filter(
            (o, idx, arr) => arr.findIndex((x) => x.user.id === o.user.id) === idx
          );
          const ownerAvatars = uniqueOwners.slice(0, 4);
          const extraOwners = uniqueOwners.length - ownerAvatars.length;
          const ownerLabel = iOwn
            ? uniqueOwners.length > 1
              ? `You + ${uniqueOwners.length - 1} other${uniqueOwners.length - 1 === 1 ? "" : "s"} own this`
              : "You own this"
            : uniqueOwners.length > 0
            ? `${uniqueOwners.length} member${uniqueOwners.length === 1 ? "" : "s"} own this`
            : null;
          // Avatar stack: up to 5 voters shown
          const avatarVoters = opt.votes.slice(0, 5);
          const extraVoters = opt.votes.length - avatarVoters.length;
          return (
            <li key={opt.id}>
              <button
                disabled={isClosed || vote.isPending}
                onClick={() => vote.mutate({ pollOptionId: opt.id })}
                className={`w-full text-left rounded-md px-2 py-1 -mx-2 transition-colors ${isWinner ? "bg-primary/8 ring-1 ring-primary/30" : ""}`}
              >
                <div className={`flex items-center justify-between text-sm mb-0.5 ${iVoted ? "font-medium" : ""}`}>
                  <span className="flex items-center gap-1.5">
                    {isWinner && <span className="text-sm">🏆</span>}
                    {iVoted && !isWinner && <span className="text-primary text-xs">✓</span>}
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
                    className={`h-full transition-all ${isWinner ? "bg-primary" : "bg-primary/60"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {/* Avatar stack — who voted for this option */}
                {count > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <div className="flex -space-x-1.5">
                      {avatarVoters.map((v) => (
                        v.user.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={v.userId}
                            src={v.user.image}
                            alt={v.user.name}
                            title={v.user.name}
                            className="h-5 w-5 rounded-full border border-background object-cover"
                          />
                        ) : (
                          <span
                            key={v.userId}
                            title={v.user.name}
                            className="h-5 w-5 rounded-full border border-background bg-muted flex items-center justify-center text-[9px] font-medium text-muted-foreground"
                          >
                            {v.user.name[0]?.toUpperCase() ?? "?"}
                          </span>
                        )
                      ))}
                    </div>
                    {extraVoters > 0 && (
                      <span className="text-[10px] text-muted-foreground">+{extraVoters}</span>
                    )}
                  </div>
                )}
                {uniqueOwners.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="flex -space-x-1">
                      {ownerAvatars.map((o) => (
                        o.user.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={o.user.id}
                            src={o.user.image}
                            alt={o.user.name}
                            title={o.user.name}
                            className="h-4 w-4 rounded-full border border-background object-cover"
                          />
                        ) : (
                          <span
                            key={o.user.id}
                            title={o.user.name}
                            className="h-4 w-4 rounded-full border border-background bg-muted flex items-center justify-center text-[8px] font-medium text-muted-foreground"
                          >
                            {o.user.name[0]?.toUpperCase() ?? "?"}
                          </span>
                        )
                      ))}
                    </div>
                    {extraOwners > 0 && (
                      <span className="text-[10px] text-muted-foreground">+{extraOwners}</span>
                    )}
                    <p className={`text-xs ${iOwn ? "text-primary" : "text-muted-foreground"}`}>
                      {ownerLabel}
                    </p>
                  </div>
                )}
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

// ── Game option slot with search + quick-add ──────────────────────────────────

type GameOption = { uid: string; label: string; gameId?: string };

function newGameOption(): GameOption {
  return { uid: crypto.randomUUID(), label: "" };
}

function GameOptionSlot({
  index,
  value,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  value: GameOption;
  onChange: (v: GameOption) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [query, setQuery] = useState(value.gameId ? "" : value.label);
  const [showDropdown, setShowDropdown] = useState(false);
  const [quickAddMode, setQuickAddMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const searchEnabled = query.trim().length >= 1 && !value.gameId;
  const { data: results, isFetching } = api.games.search.useQuery(
    { query: query.trim() },
    { enabled: searchEnabled, staleTime: 10_000 }
  );

  const quickAdd = api.games.create.useMutation({
    onSuccess: (data) => {
      onChange({ ...value, label: query.trim(), gameId: data.id });
      setShowDropdown(false);
      setQuickAddMode(false);
    },
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // If a game is selected, show its label as a chip
  if (value.gameId) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm bg-muted/50">
        <span className="flex-1 truncate">{value.label}</span>
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive text-xs shrink-0"
          onClick={() => { onChange({ ...value, label: "", gameId: undefined }); setQuery(""); }}
        >
          ×
        </button>
        {canRemove && (
          <button type="button" className="text-muted-foreground hover:text-destructive text-xs shrink-0" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        <Input
          placeholder={`Game ${index + 1} — type to search`}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); onChange({ ...value, label: e.target.value, gameId: undefined }); }}
          onFocus={() => { if (query.trim()) setShowDropdown(true); }}
          autoComplete="off"
        />
        {canRemove && (
          <button type="button" className="text-xs text-muted-foreground hover:text-destructive shrink-0" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>

      {showDropdown && query.trim().length >= 1 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md text-sm overflow-hidden">
          {isFetching && <p className="px-3 py-2 text-muted-foreground">Searching…</p>}
          {!isFetching && results?.map((g) => (
            <button
              key={g.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange({ ...value, label: g.title, gameId: g.id }); setShowDropdown(false); setQuery(""); }}
            >
              {g.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.coverUrl} alt="" className="h-8 w-6 rounded object-cover shrink-0" />
              )}
              <span className="truncate">{g.title}</span>
            </button>
          ))}
          {!isFetching && results?.length === 0 && !quickAddMode && (
            <div className="px-3 py-2 text-muted-foreground">
              No results.{" "}
              <button
                type="button"
                className="text-primary hover:underline"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setQuickAddMode(true)}
              >
                Add &ldquo;{query.trim()}&rdquo; as new game
              </button>
            </div>
          )}
          {quickAddMode && (
            <div className="px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-sm truncate">Add &ldquo;{query.trim()}&rdquo; to catalog?</span>
              <div className="flex gap-2 shrink-0">
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setQuickAddMode(false)}>Cancel</button>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  disabled={quickAdd.isPending}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => quickAdd.mutate({ title: query.trim() })}
                >
                  {quickAdd.isPending ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create poll dialog ────────────────────────────────────────────────────────

function CreatePollDialog({ eventId, groupId, onCreated, forceOpen, onForceOpenChange }: {
  eventId: string;
  groupId: string;
  onCreated: () => void;
  forceOpen?: boolean;
  onForceOpenChange?: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  // Allow external callers (e.g. the post-create nudge banner) to open the dialog.
  // Note: the parent must reset forceOpen to false when onForceOpenChange(false) is
  // called, otherwise a future true→true transition won't re-fire this effect.
  // Today's only caller (the nudge banner) hides itself before setting forceOpen,
  // so re-triggering from the banner is impossible — this is intentional.
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  function handleOpenChange(v: boolean) {
    setOpen(v);
    onForceOpenChange?.(v);
  }
  const [question, setQuestion] = useState("");
  const [type, setType] = useState<"time_slot" | "game" | "custom">("custom");
  // Plain text options (custom / time_slot)
  const [options, setOptions] = useState(["", ""]);
  // Game options (game type) — uid used as stable React key
  const [gameOptions, setGameOptions] = useState<GameOption[]>([newGameOption(), newGameOption()]);
  const [error, setError] = useState("");

  function resetForm() {
    setQuestion(""); setOptions(["", ""]); setGameOptions([newGameOption(), newGameOption()]); setError("");
  }

  function handleTypeChange(t: "time_slot" | "game" | "custom") {
    setType(t);
    setError("");
    // Reset the option list for the newly selected type so stale data doesn't leak across types
    if (t === "game") {
      setGameOptions([newGameOption(), newGameOption()]);
    } else {
      setOptions(["", ""]);
    }
  }

  const create = api.polls.create.useMutation({
    onSuccess: () => { setOpen(false); resetForm(); onCreated(); },
    onError: (e) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (type === "game") {
      const filled = gameOptions.filter((o) => o.label.trim());
      if (filled.length < 2) { setError("Need at least 2 game options."); return; }
      const missing = filled.filter((o) => !o.gameId);
      if (missing.length > 0) { setError("Select a game from search results or use 'Add as new game' for each option."); return; }
      create.mutate({
        eventId, groupId, type, question,
        options: filled.map((o, i) => ({ label: o.label, gameId: o.gameId, sortOrder: i })),
      });
    } else {
      const filtered = options.filter((o) => o.trim());
      if (filtered.length < 2) { setError("Need at least 2 options."); return; }
      create.mutate({
        eventId, groupId, type, question,
        options: filtered.map((label, i) => ({ label, sortOrder: i })),
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { handleOpenChange(v); if (!v) resetForm(); }}>
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
                <button key={t} type="button" onClick={() => handleTypeChange(t)}
                  className={`rounded-md border px-3 py-1 text-sm transition-colors ${type === t ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  {t === "time_slot" ? "Time slot" : t === "game" ? "Game vote" : "Custom"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="poll-q">Question</Label>
            <Input id="poll-q" required value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. What should we play?" />
          </div>
          <div className="space-y-2">
            <Label>Options</Label>
            {type === "game" ? (
              <>
                {gameOptions.map((opt, i) => (
                  <GameOptionSlot
                    key={opt.uid}
                    index={i}
                    value={opt}
                    onChange={(v) => setGameOptions(gameOptions.map((o, j) => j === i ? v : o))}
                    onRemove={() => setGameOptions(gameOptions.filter((_, j) => j !== i))}
                    canRemove={gameOptions.length > 2}
                  />
                ))}
                {gameOptions.length < 20 && (
                  <button type="button" onClick={() => setGameOptions([...gameOptions, newGameOption()])}
                    className="text-xs text-muted-foreground hover:text-foreground">
                    + Add game
                  </button>
                )}
              </>
            ) : (
              <>
                {options.map((opt, i) => (
                  <Input key={i} value={opt} placeholder={`Option ${i + 1}`}
                    onChange={(e) => setOptions(options.map((o, j) => j === i ? e.target.value : o))} />
                ))}
                <button type="button" onClick={() => setOptions([...options, ""])}
                  className="text-xs text-muted-foreground hover:text-foreground">
                  + Add option
                </button>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
            <Button type="submit" disabled={!question.trim() || create.isPending}>
              {create.isPending ? "Creating…" : "Create poll"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}


// ── Edit event dialog (organiser only) ───────────────────────────────────────

function EditEventDialog({
  event,
  onUpdated,
}: {
  event: { id: string; title: string; description?: string | null; location?: string | null };
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? "");
  const [location, setLocation] = useState(event.location ?? "");
  const [error, setError] = useState("");

  // Reset form when dialog opens so edits reflect latest values
  function handleOpenChange(v: boolean) {
    if (v) {
      setTitle(event.title);
      setDescription(event.description ?? "");
      setLocation(event.location ?? "");
      setError("");
    }
    setOpen(v);
  }

  const update = api.events.update.useMutation({
    onSuccess: () => { setOpen(false); onUpdated(); },
    onError: (e) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className="text-xs text-muted-foreground hover:text-foreground">
          Edit
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit event</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            update.mutate({
              id: event.id,
              title: title.trim(),
              description: description.trim() || null,
              location: location.trim() || null,
            });
          }}
          className="space-y-4"
        >
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="edit-event-title">Title</Label>
            <Input
              id="edit-event-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-event-desc">Description (optional)</Label>
            <Textarea
              id="edit-event-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-event-location">Location (optional)</Label>
            <Input
              id="edit-event-location"
              placeholder="e.g. Discord #gaming, 123 Main St"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!title.trim() || update.isPending}>
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Event detail page ─────────────────────────────────────────────────────────

// ── Event discussion ──────────────────────────────────────────────────────────

function EventDiscussion({ eventId, currentUserId, isGroupAdmin }: { eventId: string; currentUserId: string; isGroupAdmin: boolean }) {
  const { data: eventPosts, refetch } = api.feed.listForEvent.useQuery({ eventId });

  function refresh() { void refetch(); }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Discussion</p>
      <PostComposer eventId={eventId} onPosted={refresh} />
      {eventPosts?.length === 0 && (
        <p className="text-sm text-muted-foreground">No posts yet. Start the discussion!</p>
      )}
      {eventPosts?.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          currentUserId={currentUserId}
          isGroupAdmin={isGroupAdmin}
          onRefresh={refresh}
        />
      ))}
    </div>
  );
}

// ── iCalendar export ──────────────────────────────────────────────────────────

function formatIcsDate(d: Date): string {
  // Format: YYYYMMDDTHHmmssZ (UTC)
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 §3.3.11 TEXT escaping: backslash, semicolon, comma, newline. */
function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * RFC 5545 §3.1 line-folding: content lines must be ≤75 octets.
 * Long lines are folded by inserting CRLF + one space.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  let result = "";
  let remaining = line;
  while (remaining.length > 75) {
    result += remaining.slice(0, 75) + "\r\n ";
    remaining = remaining.slice(75);
  }
  return result + remaining;
}

function downloadIcs(event: {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  confirmedStartsAt?: Date | string | null;
  confirmedEndsAt?: Date | string | null;
}) {
  if (!event.confirmedStartsAt) return;
  const start = new Date(event.confirmedStartsAt);
  // If no end time, default to 2 hours after start
  const end = event.confirmedEndsAt
    ? new Date(event.confirmedEndsAt)
    : new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ProjectCampfire//EN",
    "BEGIN:VEVENT",
    // Use event.id as UID for stable deduplication — reimporting the same event won't duplicate it.
    `UID:${event.id}@projectcampfire`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeIcsText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const content = lines.map(foldLine).join("\r\n");
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = event.title.replace(/[^a-z0-9]/gi, "-").toLowerCase().replace(/^-+|-+$/g, "") || "event";
  a.download = `${safeName}.ics`;
  a.click();
  // Defer revoke so the browser's async download handler has time to read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ── Event detail page ─────────────────────────────────────────────────────────

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = api.useUtils();

  // Post-create nudge: show once when arriving from the propose-session dialog.
  // nudgeChecked ref ensures the effect runs at most once even if searchParams
  // returns a new object after replaceState triggers a re-render.
  const nudgeChecked = useRef(false);
  const [showNudge, setShowNudge] = useState(false);
  const [openPollDialog, setOpenPollDialog] = useState(false);
  useEffect(() => {
    if (nudgeChecked.current) return;
    if (searchParams.get("created") === "1") {
      nudgeChecked.current = true;
      // Strip params without pushing a new history entry
      const url = new URL(window.location.href);
      url.searchParams.delete("created");
      const nudgePoll = url.searchParams.get("nudge") === "poll";
      url.searchParams.delete("nudge");
      window.history.replaceState(null, "", url.toString());
      if (nudgePoll) {
        // "Add poll" was chosen in the propose dialog — open poll dialog immediately.
        setOpenPollDialog(true);
      } else {
        setShowNudge(true);
      }
    }
  }, [searchParams]);

  const { data: me } = api.user.me.useQuery();
  const { data: event, isLoading } = api.events.get.useQuery({ id });
  const { data: groupData } = api.groups.get.useQuery(
    { id: event?.groupId ?? "" },
    { enabled: !!event?.groupId }
  );
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

  // Game ownership overlap for the attached game (CAMP-180)
  const { data: gameOwners } = api.games.ownershipOverlap.useQuery(
    { gameId: event?.game?.id ?? "", groupId: event?.groupId ?? "" },
    { enabled: !!event?.game?.id && !!event?.groupId, staleTime: 60_000 }
  );

  // Game attach/detach (CAMP-193)
  const [showGamePicker, setShowGamePicker] = useState(false);
  const attachGame = api.events.attachGame.useMutation({
    onSuccess: () => { void utils.events.get.invalidate({ id }); setShowGamePicker(false); },
  });
  const detachGame = api.events.detachGame.useMutation({
    onSuccess: () => void utils.events.get.invalidate({ id }),
  });

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (!event) return <p className="text-muted-foreground text-sm">Event not found.</p>;

  const myUserId = me?.id ?? "";
  const myRsvp = event.rsvps.find((r) => r.user.id === myUserId)?.status ?? null;
  const yesCount = event.rsvps.filter((r) => r.status === "yes").length;
  const maybeCount = event.rsvps.filter((r) => r.status === "maybe").length;
  const noCount = event.rsvps.filter((r) => r.status === "no").length;
  const isEventCreator = event.createdBy.id === myUserId;
  const isEventCreatorAndDraft = isEventCreator && event.status === "draft";
  const isGroupAdmin = groupData?.myRole === "owner" || groupData?.myRole === "admin";

  return (
    <div className="space-y-6">
      {/* Post-create nudge banner — shown once after proposing a session from the overlap view */}
      {showNudge && isEventCreatorAndDraft && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <p className="font-medium">Session created. What would you like to do next?</p>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setOpenPollDialog(true); setShowNudge(false); }}
            >
              Add a poll
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setStatusError("");
                // Dismiss the banner only on success — if the mutation fails,
                // statusError renders in the Event controls section below.
                updateStatus.mutate(
                  { id, status: "open" },
                  { onSuccess: () => setShowNudge(false) }
                );
              }}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending ? "Opening…" : "Open for RSVPs"}
            </Button>
            <button
              className="text-muted-foreground hover:text-foreground text-xs ml-1"
              onClick={() => setShowNudge(false)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <button onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-foreground mb-2">
          ← Back
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-2xl font-bold">{event.title}</h1>
              {isEventCreator && event.status !== "cancelled" && (
                <EditEventDialog
                  event={event}
                  onUpdated={() => void utils.events.get.invalidate({ id })}
                />
              )}
            </div>
            {event.description && <p className="text-muted-foreground mt-1">{event.description}</p>}
          </div>
          <Badge variant={event.status === "cancelled" ? "destructive" : event.status === "confirmed" ? "default" : "secondary"}>
            {STATUS_LABEL[event.status]}
          </Badge>
        </div>
        {event.confirmedStartsAt && (
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {format(new Date(event.confirmedStartsAt), "EEEE d MMMM, HH:mm")}
              {event.confirmedEndsAt && ` – ${format(new Date(event.confirmedEndsAt), "HH:mm")}`}
            </p>
            <button
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              onClick={() => downloadIcs(event)}
            >
              Add to Calendar
            </button>
          </div>
        )}
        {event.location && (
          <p className="text-sm text-muted-foreground mt-1">
            📍 {event.location}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Created by {event.createdBy.name}
        </p>
      </div>

      {/* Game section (CAMP-193) */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Game</p>
        {event.game ? (
          <div className="flex items-center gap-3">
            {event.game.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.game.coverUrl} alt="" className="h-12 w-9 rounded object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{event.game.title}</p>
              {event.gameOptional && (
                <span className="text-xs text-muted-foreground">Optional — bring your own choice</span>
              )}
              {/* Who in the group owns this game (CAMP-180) */}
              {gameOwners && gameOwners.length > 0 && (() => {
                const uniqueGameOwners = gameOwners.filter(
                  (o, idx, arr) => arr.findIndex((x) => x.user.id === o.user.id) === idx
                );
                const avatars = uniqueGameOwners.slice(0, 4);
                const extra = uniqueGameOwners.length - avatars.length;
                const iOwn = gameOwners.some((o) => o.user.id === myUserId);
                return (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="flex -space-x-1">
                      {avatars.map((o) => (
                        o.user.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={o.user.id}
                            src={o.user.image}
                            alt={o.user.name}
                            title={o.user.name}
                            className="h-4 w-4 rounded-full border border-background object-cover"
                          />
                        ) : (
                          <span
                            key={o.user.id}
                            title={o.user.name}
                            className="h-4 w-4 rounded-full border border-background bg-muted flex items-center justify-center text-[8px] font-medium text-muted-foreground"
                          >
                            {o.user.name[0]?.toUpperCase() ?? "?"}
                          </span>
                        )
                      ))}
                    </div>
                    {extra > 0 && <span className="text-[10px] text-muted-foreground">+{extra}</span>}
                    <p className={`text-xs ${iOwn ? "text-primary" : "text-muted-foreground"}`}>
                      {iOwn
                        ? uniqueGameOwners.length > 1
                          ? `You + ${uniqueGameOwners.length - 1} other${uniqueGameOwners.length - 1 === 1 ? "" : "s"} own this`
                          : "You own this"
                        : `${uniqueGameOwners.length} member${uniqueGameOwners.length === 1 ? "" : "s"} own this`}
                    </p>
                  </div>
                );
              })()}
            </div>
            {isEventCreator && event.status !== "cancelled" && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowGamePicker(true)}
                >
                  Change
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  disabled={detachGame.isPending}
                  onClick={() => detachGame.mutate({ id })}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                Game TBD
              </span>
            </div>
            {isEventCreator && event.status !== "cancelled" && !showGamePicker && (
              <button
                type="button"
                className="text-xs text-primary hover:underline shrink-0"
                onClick={() => setShowGamePicker(true)}
              >
                + Add game
              </button>
            )}
          </div>
        )}

        {/* Inline game picker for attach/change */}
        {showGamePicker && isEventCreator && (
          <div className="rounded-md border p-3 space-y-2">
            <p className="text-xs text-muted-foreground">Search for a game to attach</p>
            <GameSearchInput
              onPick={(g) => attachGame.mutate({ id, gameId: g.id })}
              disabled={attachGame.isPending}
            />
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowGamePicker(false)}
            >
              Cancel
            </button>
          </div>
        )}
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
                variant={myRsvp === s ? "default" : "outline"}
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
              forceOpen={openPollDialog}
              onForceOpenChange={(v) => { if (!v) setOpenPollDialog(false); }}
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
              groupId={event.groupId}
              myUserId={myUserId}
              onVote={() => void utils.events.get.invalidate({ id })}
            />
          ))
        )}
      </div>

      {/* Discussion */}
      <EventDiscussion eventId={id} currentUserId={myUserId} isGroupAdmin={isGroupAdmin} />

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
