"use client";

/**
 * GroupOverlapView — Outlook scheduling-assistant style week view.
 *
 * - Shows each member's available slots as coloured horizontal bands.
 * - Highlights overlap windows (all selected members free) with a green tint.
 * - Click an overlap window to propose a session (creates a draft event with
 *   the start/end time pre-filled, then navigates to the event page).
 * - Toggle individual members on/off to narrow the overlap.
 *
 * Note: the grid is rendered in UTC. Availability slots returned by the server
 * are already expressed as UTC ISO timestamps (expanded from the member's local
 * timezone by expandAvailability on the server). The times shown on the grid
 * are therefore UTC wall-clock times. This is a known MVP limitation — a future
 * improvement would convert slot positions to the viewing user's local timezone.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, addDays, parseISO, startOfWeek, endOfWeek } from "date-fns";
import { api, type RouterOutputs } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GameSearchInput, type GamePickResult } from "@/components/games/game-search-input";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Grid resolution in minutes */
const SLOT_MINUTES = 30;
const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES; // 48
const HOUR_HEIGHT_PX = 48; // px per hour
const SLOT_HEIGHT_PX = HOUR_HEIGHT_PX / (60 / SLOT_MINUTES);

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Convert an ISO timestamp to a 30-min slot index relative to UTC midnight of dateStr */
function isoToSlotIndex(iso: string, dateStr: string): number {
  const d = new Date(iso);
  const base = new Date(`${dateStr}T00:00:00Z`);
  const diffMs = d.getTime() - base.getTime();
  return Math.floor(diffMs / (SLOT_MINUTES * 60 * 1000));
}

function slotIndexToTime(idx: number): string {
  const h = Math.floor((idx * SLOT_MINUTES) / 60);
  const m = (idx * SLOT_MINUTES) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function slotIndexToISO(dateStr: string, slotIdx: number): string {
  const base = new Date(`${dateStr}T00:00:00Z`);
  base.setUTCMinutes(base.getUTCMinutes() + slotIdx * SLOT_MINUTES);
  return base.toISOString();
}

// ── Types derived from tRPC output (avoids unsafe `as` casts) ─────────────────

type GroupOverlapItem = RouterOutputs["availability"]["groupOverlap"][number];
type ComputedSlot = GroupOverlapItem["slots"][number];

/** Member availability as a set of slot indices per date */
type MemberSlots = Record<string, Set<number>>;

function buildMemberSlots(slots: ComputedSlot[]): MemberSlots {
  const result: MemberSlots = {};
  for (const slot of slots) {
    if (slot.type !== "available") continue;
    const dateStr = slot.date;
    if (!result[dateStr]) result[dateStr] = new Set();
    const startIdx = Math.max(0, isoToSlotIndex(slot.start, dateStr));
    const endIdx = Math.min(SLOTS_PER_DAY, isoToSlotIndex(slot.end, dateStr));
    for (let i = startIdx; i < endIdx; i++) {
      result[dateStr].add(i);
    }
  }
  return result;
}

/**
 * For each date and slot index, count how many selected members are available.
 * Returns a map of date → (slotIndex → count).
 */
function computeOverlapCounts(
  members: Array<{ slots: MemberSlots }>,
  dates: string[]
): Record<string, Map<number, number>> {
  const result: Record<string, Map<number, number>> = {};
  for (const date of dates) {
    const counts = new Map<number, number>();
    for (const m of members) {
      for (const idx of m.slots[date] ?? new Set<number>()) {
        counts.set(idx, (counts.get(idx) ?? 0) + 1);
      }
    }
    result[date] = counts;
  }
  return result;
}

/** Extract slot indices where count >= minCount */
function slotsWithMinCount(counts: Map<number, number>, minCount: number): Set<number> {
  const result = new Set<number>();
  for (const [idx, count] of counts) {
    if (count >= minCount) result.add(idx);
  }
  return result;
}

/** Merge contiguous slot indices into [startIdx, endIdx] ranges */
function mergeSlots(slots: Set<number>): Array<[number, number]> {
  const sorted = [...slots].sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const ranges: Array<[number, number]> = [];
  let start = sorted[0]!;
  let prev = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) { prev = sorted[i]!; }
    else { ranges.push([start, prev + 1]); start = sorted[i]!; prev = sorted[i]!; }
  }
  ranges.push([start, prev + 1]);
  return ranges;
}

// ── Colour palette for members ────────────────────────────────────────────────
// Each entry has a `band` class (used on the availability band) and a `dot`
// class (used on the toggle button indicator). Keeping them separate avoids
// fragile string manipulation to derive one from the other.

const MEMBER_COLORS: Array<{ band: string; dot: string }> = [
  { band: "bg-blue-400/50 border-blue-500",   dot: "bg-blue-400" },
  { band: "bg-purple-400/50 border-purple-500", dot: "bg-purple-400" },
  { band: "bg-orange-400/50 border-orange-500", dot: "bg-orange-400" },
  { band: "bg-pink-400/50 border-pink-500",   dot: "bg-pink-400" },
  { band: "bg-cyan-400/50 border-cyan-500",   dot: "bg-cyan-400" },
  { band: "bg-yellow-400/50 border-yellow-500", dot: "bg-yellow-400" },
];

// ── Propose session dialog ────────────────────────────────────────────────────
//
// Step 1: enter title → Next
// Step 2: choose Add poll / Pick game / Decide later
//   - "Add poll": create event then navigate with ?created=1&nudge=poll
//   - "Pick game": show inline game search, then create event with gameId
//   - "Decide later": create event immediately (existing behaviour)

type ProposeStep = "title" | "game_choice" | "pick_game";

function ProposeDialog({
  open,
  onClose,
  groupId,
  startsAt,
  endsAt,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  startsAt: string;
  endsAt: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<ProposeStep>("title");
  const [title, setTitle] = useState("");
  const [pickedGame, setPickedGame] = useState<GamePickResult | null>(null);
  const [error, setError] = useState("");

  function reset() {
    setStep("title");
    setTitle("");
    setPickedGame(null);
    setError("");
  }

  // Capture the intended navigation suffix before the mutation fires.
  // Using a ref avoids reading stale closure state in onSuccess (which runs
  // after reset() has already set step back to "title").
  const pendingSuffixRef = useRef("?created=1");

  const create = api.events.create.useMutation({
    onSuccess: ({ id }) => {
      const suffix = pendingSuffixRef.current;
      reset();
      onClose();
      router.push(`/events/${id}${suffix}`);
    },
    onError: (e) => setError(e.message),
  });

  function createEvent(opts: { gameId?: string; addPoll?: boolean } = {}) {
    setError("");
    // Determine the navigation suffix before the mutation fires so onSuccess
    // reads the correct intent even after reset() has run.
    if (opts.gameId) {
      pendingSuffixRef.current = "?created=1";
    } else if (opts.addPoll) {
      pendingSuffixRef.current = "?created=1&nudge=poll";
    } else {
      pendingSuffixRef.current = "?created=1";
    }
    create.mutate({
      groupId,
      title,
      confirmedStartsAt: startsAt,
      confirmedEndsAt: endsAt,
      gameId: opts.gameId,
    });
  }

  const startLabel = format(new Date(startsAt), "EEE d MMM, HH:mm");
  const endLabel = format(new Date(endsAt), "HH:mm");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Propose session</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {startLabel} – {endLabel} (UTC)
        </p>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        {/* Step 1: title */}
        {step === "title" && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (title.trim()) setStep("game_choice"); }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="propose-title">Event title</Label>
              <Input
                id="propose-title"
                placeholder="e.g. Friday Night Session"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={!title.trim()}>Next</Button>
            </div>
          </form>
        )}

        {/* Step 2: game choice */}
        {step === "game_choice" && (
          <div className="space-y-3">
            <p className="text-sm font-medium">What are you playing?</p>
            <div className="grid gap-2">
              <Button
                variant="outline"
                className="justify-start h-auto py-3 px-4"
                onClick={() => setStep("pick_game")}
              >
                <div className="text-left">
                  <p className="font-medium">Pick a game</p>
                  <p className="text-xs text-muted-foreground font-normal">Attach a specific game to the session</p>
                </div>
              </Button>
              <Button
                variant="outline"
                className="justify-start h-auto py-3 px-4"
                disabled={create.isPending}
                onClick={() => createEvent({ addPoll: true })}
              >
                <div className="text-left">
                  <p className="font-medium">Add a poll</p>
                  <p className="text-xs text-muted-foreground font-normal">Let the group vote on what to play</p>
                </div>
              </Button>
              <Button
                variant="outline"
                className="justify-start h-auto py-3 px-4"
                disabled={create.isPending}
                onClick={() => createEvent()}
              >
                <div className="text-left">
                  <p className="font-medium">Decide later</p>
                  <p className="text-xs text-muted-foreground font-normal">Create the event now, add game info after</p>
                </div>
              </Button>
            </div>
            <div className="flex justify-start">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setStep("title")}
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* Step 3: pick game */}
        {step === "pick_game" && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Search for a game</p>
            {pickedGame ? (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm bg-muted/50">
                {pickedGame.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pickedGame.coverUrl} alt="" className="h-8 w-6 rounded object-cover shrink-0" />
                )}
                <span className="flex-1 truncate">{pickedGame.title}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive text-xs shrink-0"
                  onClick={() => setPickedGame(null)}
                >
                  ×
                </button>
              </div>
            ) : (
              <GameSearchInput onPick={(g) => setPickedGame(g)} autoFocus />
            )}
            <div className="flex justify-between items-center">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => { setPickedGame(null); setStep("game_choice"); }}
              >
                ← Back
              </button>
              <Button
                disabled={!pickedGame || create.isPending}
                onClick={() => { if (pickedGame) createEvent({ gameId: pickedGame.id }); }}
              >
                {create.isPending ? "Creating…" : "Create event"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Day column ────────────────────────────────────────────────────────────────

function DayColumn({
  dateStr,
  memberData,
  overlapCounts,
  totalActiveMembers,
  onClickOverlap,
  isToday = false,
}: {
  dateStr: string;
  memberData: Array<{ userId: string; band: string; slots: MemberSlots; hidden: boolean }>;
  overlapCounts: Map<number, number>;
  totalActiveMembers: number;
  onClickOverlap: (startIdx: number, endIdx: number) => void;
  isToday?: boolean;
}) {
  // Green threshold = all active members, minimum 2.
  // With 1 active member: green never fires (solo "everyone free" isn't useful).
  // With exactly 2 active members: green and yellow thresholds are both 2, so
  // yellow-only slots never appear — any 2-person overlap goes straight to green.
  // Yellow-only slots only activate with 3+ active members.
  const greenThreshold = Math.max(2, totalActiveMembers);
  const greenSlots = slotsWithMinCount(overlapCounts, greenThreshold);
  const yellowSlots = slotsWithMinCount(overlapCounts, 2);
  // Yellow ranges excludes slots already covered by green
  const yellowOnly = new Set([...yellowSlots].filter((i) => !greenSlots.has(i)));

  const greenRanges = mergeSlots(greenSlots);
  const yellowRanges = mergeSlots(yellowOnly);

  return (
    <div
      className={cn("relative flex-1 min-w-0 border-l", isToday && "bg-primary/[0.03]")}
      style={{ height: SLOTS_PER_DAY * SLOT_HEIGHT_PX }}
    >
      {/* Hour lines — 24 lines for hours 0–23, plus a closing bottom border */}
      {Array.from({ length: 24 }, (_, h) => (
        <div
          key={h}
          className="absolute left-0 right-0 border-t border-border/40"
          style={{ top: h * HOUR_HEIGHT_PX }}
        />
      ))}
      <div className="absolute left-0 right-0 border-t border-border/40" style={{ top: 24 * HOUR_HEIGHT_PX }} />

      {/* Member availability bands.
          Hidden members render full-width at opacity-15 behind the visible
          lanes so the viewer can still reference their schedule. Visible members
          are split into side-by-side lanes (existing behaviour). */}
      {(() => {
        const visibleMembers = memberData.filter((m) => !m.hidden);
        const laneWidth = visibleMembers.length > 0 ? 100 / visibleMembers.length : 100;
        const visibleIndexMap = new Map(visibleMembers.map((m, i) => [m.userId, i]));
        return memberData.map(({ userId, band, slots, hidden }) => {
          const ranges = mergeSlots(slots[dateStr] ?? new Set());
          if (hidden) {
            // Full-width faint band behind visible lanes
            return ranges.map(([start, end]) => (
              <div
                key={`${userId}-${start}-${end}`}
                className={`absolute border-l-2 ${band} opacity-15`}
                style={{
                  top: start * SLOT_HEIGHT_PX,
                  height: (end - start) * SLOT_HEIGHT_PX,
                  left: 0,
                  width: "100%",
                }}
              />
            ));
          }
          const memberIdx = visibleIndexMap.get(userId) ?? 0;
          return ranges.map(([start, end]) => (
            <div
              key={`${userId}-${start}-${end}`}
              className={`absolute border-l-2 ${band} opacity-60`}
              style={{
                top: start * SLOT_HEIGHT_PX,
                height: (end - start) * SLOT_HEIGHT_PX,
                left: `${memberIdx * laneWidth}%`,
                width: `${laneWidth}%`,
              }}
            />
          ));
        });
      })()}

      {/* Yellow: 2+ members overlap (z-10). Green renders after at z-20 so it
          paints on top explicitly rather than relying on DOM sibling order. */}
      {yellowRanges.map(([start, end]) => (
        <button
          key={`y-${start}-${end}`}
          className="absolute left-0 right-0 bg-yellow-300/20 hover:bg-yellow-300/35 border border-yellow-400/50 rounded cursor-pointer transition-colors z-10"
          style={{
            top: start * SLOT_HEIGHT_PX + 1,
            height: (end - start) * SLOT_HEIGHT_PX - 2,
          }}
          title={`${slotIndexToTime(start)} – ${slotIndexToTime(end)} — 2+ members free`}
          onClick={() => onClickOverlap(start, end)}
          aria-label={`2+ members free ${slotIndexToTime(start)}–${slotIndexToTime(end)}, click to propose session`}
        />
      ))}

      {/* Green: all active members overlap (or 3+) — z-20 keeps it above yellow */}
      {greenRanges.map(([start, end]) => (
        <button
          key={`g-${start}-${end}`}
          className="absolute left-0 right-0 bg-green-400/30 hover:bg-green-400/50 border border-green-500/60 rounded cursor-pointer transition-colors z-20"
          style={{
            top: start * SLOT_HEIGHT_PX + 1,
            height: (end - start) * SLOT_HEIGHT_PX - 2,
          }}
          title={`${slotIndexToTime(start)} – ${slotIndexToTime(end)} — all included members free, click to propose session`}
          onClick={() => onClickOverlap(start, end)}
          aria-label={`All included members free ${slotIndexToTime(start)}–${slotIndexToTime(end)}, click to propose session`}
        />
      ))}
    </div>
  );
}

// ── Time axis ─────────────────────────────────────────────────────────────────

function TimeAxis() {
  return (
    <div className="relative shrink-0 w-10 text-right pr-1" style={{ height: SLOTS_PER_DAY * SLOT_HEIGHT_PX }}>
      {/* Labels for hours 00–23; the closing line at row 24 has no label */}
      {Array.from({ length: 24 }, (_, h) => (
        <div
          key={h}
          className="absolute right-1 text-[10px] text-muted-foreground leading-none -translate-y-1/2"
          style={{ top: h * HOUR_HEIGHT_PX }}
        >
          {String(h).padStart(2, "0")}:00
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function GroupOverlapView({ groupId }: { groupId: string }) {
  // Week navigation
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday
  );

  const weekDates = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), "yyyy-MM-dd")),
    [weekStart]
  );

  // Updated every minute so the highlight corrects itself if the tab is left open past midnight
  const [todayStr, setTodayStr] = useState(() => format(new Date(), "yyyy-MM-dd"));
  useEffect(() => {
    const id = setInterval(() => setTodayStr(format(new Date(), "yyyy-MM-dd")), 60_000);
    return () => clearInterval(id);
  }, []);

  const from = weekDates[0]!;
  const to = weekDates[6]!;

  const { data: memberAvailability, isLoading } = api.availability.groupOverlap.useQuery(
    { groupId, from, to },
    { staleTime: 60_000 }
  );

  // Two independent member filter states (CAMP-192):
  // - hiddenIds: band not drawn on grid (cosmetic only)
  // - excludedIds: not counted toward the green/yellow overlap threshold
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  const toggleHidden = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleExcluded = useCallback((id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Propose dialog state
  const [proposal, setProposal] = useState<{ startsAt: string; endsAt: string } | null>(null);

  // Scroll to current time on mount (offset 1 hour up so "now" isn't flush with top)
  const gridScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = gridScrollRef.current;
    if (!el) return;
    const now = new Date();
    const nowPx = (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT_PX;
    requestAnimationFrame(() => { el.scrollTop = Math.max(0, nowPx - HOUR_HEIGHT_PX); });
  }, []);

  // Compute per-member slot sets — typed via RouterOutputs, no unsafe casts
  const memberSlotData = useMemo(() => {
    if (!memberAvailability) return [];
    return memberAvailability.map((m, idx) => ({
      user: m.user,
      color: MEMBER_COLORS[idx % MEMBER_COLORS.length]!,
      slots: buildMemberSlots(m.slots),
    }));
  }, [memberAvailability]);

  // Members included in the overlap threshold calculation (not excluded)
  const overlapMembers = useMemo(
    () => memberSlotData.filter((m) => !excludedIds.has(m.user.id)),
    [memberSlotData, excludedIds]
  );

  const overlapCountsByDate = useMemo(
    () => computeOverlapCounts(overlapMembers, weekDates),
    [overlapMembers, weekDates]
  );

  function handleClickOverlap(dateStr: string, startIdx: number, endIdx: number) {
    const startsAt = slotIndexToISO(dateStr, startIdx);
    const endsAt = slotIndexToISO(dateStr, endIdx);
    setProposal({ startsAt, endsAt });
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading availability…</p>;
  }

  if (!memberAvailability || memberAvailability.length === 0) {
    return <p className="text-sm text-muted-foreground">No members found.</p>;
  }

  const noOneHasSchedule = memberAvailability.every((m) => m.slots.length === 0);

  return (
    <div className="space-y-4">
      {/* Member filter chips.
          Each chip has two actions:
          - Click the name/avatar area: toggle visibility (show/hide band)
          - Click the coloured dot: toggle overlap inclusion (counts toward threshold)
          Default: everyone visible + included in overlap. */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          {memberSlotData.map((m) => {
            const isHidden = hiddenIds.has(m.user.id);
            const isExcluded = excludedIds.has(m.user.id);
            return (
              <div
                key={m.user.id}
                className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition-opacity ${isHidden ? "opacity-40" : "opacity-100"}`}
              >
                {/* Dot = overlap inclusion toggle */}
                <button
                  type="button"
                  title={isExcluded ? "Excluded from overlap — click to include" : "Included in overlap — click to exclude"}
                  aria-label={isExcluded ? `Include ${m.user.name} in overlap` : `Exclude ${m.user.name} from overlap`}
                  onClick={() => toggleExcluded(m.user.id)}
                  className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 transition-opacity ${isExcluded ? "opacity-25" : "opacity-100"} ${m.color.dot}`}
                />
                {/* Name/avatar = visibility toggle */}
                <button
                  type="button"
                  title={isHidden ? "Band hidden — click to show" : "Click to hide band"}
                  aria-label={isHidden ? `Show ${m.user.name}'s availability band` : `Hide ${m.user.name}'s availability band`}
                  onClick={() => toggleHidden(m.user.id)}
                  className="flex items-center gap-1 min-w-0"
                >
                  <Avatar className="h-4 w-4 shrink-0">
                    <AvatarImage src={m.user.image ?? undefined} />
                    <AvatarFallback className="text-[8px]">{initials(m.user.name)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">{m.user.name}</span>
                </button>
              </div>
            );
          })}
        </div>
        {/* Overlap scope label — shown when the threshold subset differs from all members */}
        {excludedIds.size > 0 && (
          <p className="text-xs text-muted-foreground">
            Showing overlap for:{" "}
            <span className="font-medium text-foreground">
              {overlapMembers.map((m) => m.user.name).join(", ") || "no one"}
            </span>
            {" "}·{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setExcludedIds(new Set())}
            >
              Reset
            </button>
          </p>
        )}
      </div>

      {noOneHasSchedule && (
        <p className="text-xs text-muted-foreground">
          No members have set their availability yet. Ask them to visit the Availability page.
        </p>
      )}

      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <button
          className="rounded border px-2 py-1 text-xs hover:bg-muted"
          onClick={() => setWeekStart((d) => addDays(d, -7))}
        >
          ← Prev
        </button>
        <span className="text-sm font-medium">
          {format(weekStart, "d MMM")} – {format(endOfWeek(weekStart, { weekStartsOn: 1 }), "d MMM yyyy")}
        </span>
        <button
          className="rounded border px-2 py-1 text-xs hover:bg-muted"
          onClick={() => setWeekStart((d) => addDays(d, 7))}
        >
          Next →
        </button>
      </div>

      {/* Grid — header is sticky inside the scroll container so both share the
          same width context and scrollbar gutter. */}
      <div className="rounded-lg border overflow-hidden">
        <div ref={gridScrollRef} className="overflow-y-auto" style={{ maxHeight: "520px" }}>
          {/* Sticky day headers */}
          <div className="sticky top-0 z-20 flex border-b bg-muted/30">
            <div className="w-10 shrink-0" />
            {weekDates.map((d) => {
              const isToday = d === todayStr;
              return (
                <div key={d} className="flex-1 min-w-0 border-l px-1 py-1.5 text-center">
                  <p className={cn("text-xs font-medium", isToday ? "text-primary" : "text-muted-foreground")}>
                    {format(parseISO(d), "EEE")}
                  </p>
                  <p className={cn("text-xs", isToday ? "text-primary font-semibold" : "text-muted-foreground")}>
                    {format(parseISO(d), "d")}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="flex">
            <TimeAxis />
            {weekDates.map((dateStr) => (
              <DayColumn
                key={dateStr}
                dateStr={dateStr}
                memberData={memberSlotData.map((m) => ({
                  userId: m.user.id,
                  band: m.color.band,
                  slots: m.slots,
                  hidden: hiddenIds.has(m.user.id),
                }))}
                overlapCounts={overlapCountsByDate[dateStr] ?? new Map()}
                totalActiveMembers={overlapMembers.length}
                onClickOverlap={(start, end) => handleClickOverlap(dateStr, start, end)}
                isToday={dateStr === todayStr}
              />
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 border-t px-3 py-2 text-xs text-muted-foreground bg-muted/10">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-blue-400/50 border border-blue-500" />
            Member available
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-yellow-300/40 border border-yellow-400/60" />
            2+ free
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-green-400/40 border border-green-500/60" />
            All included members free — click to propose
          </span>
        </div>
      </div>

      {/* Propose session dialog */}
      {proposal && (
        <ProposeDialog
          open
          onClose={() => setProposal(null)}
          groupId={groupId}
          startsAt={proposal.startsAt}
          endsAt={proposal.endsAt}
        />
      )}
    </div>
  );
}
