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

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format, addDays, parseISO, startOfWeek, endOfWeek } from "date-fns";
import { api } from "@/trpc/react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/routers/_app";

type RouterOutputs = inferRouterOutputs<AppRouter>;
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
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  const create = api.events.create.useMutation({
    onSuccess: ({ id }) => {
      onClose();
      setTitle("");
      setError("");
      router.push(`/events/${id}?created=1`);
    },
    onError: (e) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    // Pass the overlap start/end as the proposed confirmed time.
    // The event is created as a draft so the organiser can review and open it
    // for RSVPs on the event page. The time is pre-filled in the Confirm dialog.
    create.mutate({ groupId, title, confirmedStartsAt: startsAt, confirmedEndsAt: endsAt });
  }

  const startLabel = format(new Date(startsAt), "EEE d MMM, HH:mm");
  const endLabel = format(new Date(endsAt), "HH:mm");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setTitle(""); setError(""); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Propose session</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {startLabel} – {endLabel} (UTC)
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
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
          <p className="text-xs text-muted-foreground">
            Creates a draft event with the selected time pre-filled. Open it for RSVPs on the event page.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!title.trim() || create.isPending}>
              {create.isPending ? "Creating…" : "Create event"}
            </Button>
          </div>
        </form>
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
}: {
  dateStr: string;
  memberData: Array<{ userId: string; band: string; slots: MemberSlots }>;
  overlapCounts: Map<number, number>;
  totalActiveMembers: number;
  onClickOverlap: (startIdx: number, endIdx: number) => void;
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
    <div className="relative flex-1 min-w-0 border-l" style={{ height: SLOTS_PER_DAY * SLOT_HEIGHT_PX }}>
      {/* Hour lines — 24 lines for hours 0–23, plus a closing bottom border */}
      {Array.from({ length: 24 }, (_, h) => (
        <div
          key={h}
          className="absolute left-0 right-0 border-t border-border/40"
          style={{ top: h * HOUR_HEIGHT_PX }}
        />
      ))}
      <div className="absolute left-0 right-0 border-t border-border/40" style={{ top: 24 * HOUR_HEIGHT_PX }} />

      {/* Member availability bands */}
      {memberData.map(({ userId, band, slots }, memberIdx) => {
        const ranges = mergeSlots(slots[dateStr] ?? new Set());
        const laneWidth = 100 / memberData.length;
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
      })}

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
          title={`${slotIndexToTime(start)} – ${slotIndexToTime(end)} — everyone free, click to propose session`}
          onClick={() => onClickOverlap(start, end)}
          aria-label={`Everyone free ${slotIndexToTime(start)}–${slotIndexToTime(end)}, click to propose session`}
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

  const from = weekDates[0]!;
  const to = weekDates[6]!;

  const { data: memberAvailability, isLoading } = api.availability.groupOverlap.useQuery(
    { groupId, from, to },
    { staleTime: 60_000 }
  );

  // Which members are toggled on
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const toggleMember = useCallback((id: string) => {
    setDisabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Propose dialog state
  const [proposal, setProposal] = useState<{ startsAt: string; endsAt: string } | null>(null);

  // Compute per-member slot sets — typed via RouterOutputs, no unsafe casts
  const memberSlotData = useMemo(() => {
    if (!memberAvailability) return [];
    return memberAvailability.map((m, idx) => ({
      user: m.user,
      color: MEMBER_COLORS[idx % MEMBER_COLORS.length]!,
      slots: buildMemberSlots(m.slots),
    }));
  }, [memberAvailability]);

  const activeMembers = useMemo(
    () => memberSlotData.filter((m) => !disabledIds.has(m.user.id)),
    [memberSlotData, disabledIds]
  );

  const overlapCountsByDate = useMemo(
    () => computeOverlapCounts(activeMembers, weekDates),
    [activeMembers, weekDates]
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
      {/* Member toggles */}
      <div className="flex flex-wrap gap-2">
        {memberSlotData.map((m) => {
          const active = !disabledIds.has(m.user.id);
          return (
            <button
              key={m.user.id}
              onClick={() => toggleMember(m.user.id)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity ${active ? "opacity-100" : "opacity-40"}`}
            >
              <Avatar className="h-4 w-4">
                <AvatarImage src={m.user.image ?? undefined} />
                <AvatarFallback className="text-[8px]">{initials(m.user.name)}</AvatarFallback>
              </Avatar>
              <span className={`inline-block h-2 w-2 rounded-full ${m.color.dot}`} />
              {m.user.name}
            </button>
          );
        })}
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
        <div className="overflow-y-auto" style={{ maxHeight: "520px" }}>
          {/* Sticky day headers */}
          <div className="sticky top-0 z-20 flex border-b bg-muted/30">
            <div className="w-10 shrink-0" />
            {weekDates.map((d) => (
              <div key={d} className="flex-1 min-w-0 border-l px-1 py-1.5 text-center">
                <p className="text-xs font-medium">{format(parseISO(d), "EEE")}</p>
                <p className="text-xs text-muted-foreground">{format(parseISO(d), "d")}</p>
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div className="flex">
            <TimeAxis />
            {weekDates.map((dateStr) => (
              <DayColumn
                key={dateStr}
                dateStr={dateStr}
                memberData={activeMembers.map((m) => ({ userId: m.user.id, band: m.color.band, slots: m.slots }))}
                overlapCounts={overlapCountsByDate[dateStr] ?? new Map()}
                totalActiveMembers={activeMembers.length}
                onClickOverlap={(start, end) => handleClickOverlap(dateStr, start, end)}
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
            Everyone free — click to propose
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
