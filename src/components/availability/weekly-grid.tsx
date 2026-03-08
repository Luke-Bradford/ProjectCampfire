"use client";

/**
 * WeeklyGrid — custom weekly availability scheduler.
 *
 * Layout model:
 *
 *  ┌──────────────────────────────────────────────┐
 *  │ Mon  │ Tue  │ Wed  │ Thu  │ Fri  │ Sat  │ Sun │  ← sticky header
 *  ├──────────────────────────────────────────────┤
 *  │      │      │  GREEN ZONE (00:00–24:00)       │
 *  │      │      │  Normal committed events        │
 *  │      │      │  Overnight events show as two   │
 *  │      │      │  blocks: source col → midnight, │
 *  │      │      │  next col: midnight → end time  │
 *  ├──────────────────────────────────────────────┤  ← midnight (during drag)
 *  │ Tue  │ Wed  │  YELLOW ZONE (shift +1 day)     │  ← shifted day labels
 *  │      │      │  Context events from col+1      │
 *  │      │      │  shown dimmed — non-interactive │
 *  └──────────────────────────────────────────────┘
 *
 * Dragging past midnight naturally extends the grid into the yellow zone.
 * On release the grid collapses back to the green zone only.
 * Hysteresis prevents the yellow zone snapping in and out at the boundary.
 */

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { WeeklySlots, TimeSlot } from "@/server/db/schema/availability";
import { SlotEditPopover, type SlotEditState } from "./slot-edit-popover";

// ── Constants ──────────────────────────────────────────────────────────────────

const SLOT_H   = 24;          // px per 30-min row
const SNAP     = 30;          // snap to 30-min increments
const SLOTS    = 48;          // rows in a normal 24 h day
const GRID_H   = SLOTS * SLOT_H; // 960px — base "one day" height
const MAX_DRAG = 7 * 1440;    // max drag extension = full week

// Grid columns: 0=Mon … 6=Sun  ↔  JS dow: 1=Mon … 0=Sun
const COL_TO_DOW = [1, 2, 3, 4, 5, 6, 0] as const;
const DOW_TO_COL: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
const COL_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

const minToPx = (m: number) => (m / SNAP) * SLOT_H;
const pxToMin = (px: number) => (px / SLOT_H) * SNAP;
const snapMin = (m: number) => Math.round(m / SNAP) * SNAP;
const clamp   = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function minToHHmm(m: number): string {
  const mm = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
}
function hhmmToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
function hourLabel(h: number): string {
  if (h === 0 || h === 24) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

// How many column-days ahead is destCol from srcCol?
// Handles the Sun(6)→Mon(0) overnight wrap: returns 1.
function colDiffAhead(srcCol: number, destCol: number): number {
  if (destCol >= srcCol) return destCol - srcCol;
  if (srcCol === 6 && destCol === 0) return 1; // Sun→Mon overnight
  return 0; // shouldn't be called otherwise
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GridEvent {
  id: string;
  col: number;       // 0=Mon … 6=Sun
  startMin: number;  // minutes from midnight (0–1439)
  endMin: number;    // minutes; may exceed 1440 for overnight
  type: "available" | "busy";
  label: string;
}

type DragState =
  | { kind: "idle" }
  // anchorCol: column where the drag started (fixed).
  // isHorizontalDrag: true when cursor is in an adjacent column (left/right cross-column).
  //   - right drag: col=anchorCol, endMin>1440 (end in anchorCol+1)
  //   - left  drag: col=anchorCol-1, endMin=anchorMin+1440 (end in anchorCol)
  | { kind: "creating"; anchorCol: number; col: number; anchorMin: number; startMin: number; endMin: number; isHorizontalDrag?: boolean }
  | { kind: "moving";         id: string;  col: number; startMin: number; endMin: number; offsetMin: number }
  | { kind: "resizing-start"; id: string;  col: number; startMin: number; endMin: number }
  // yOffset: 0 = normal; 1440 = resizing from a continuation block (next-day offset)
  | { kind: "resizing-end";   id: string;  col: number; startMin: number; endMin: number; yOffset?: number };

// ── Lane assignment ────────────────────────────────────────────────────────────

function assignLanes(
  evs: { id: string; startMin: number; endMin: number }[],
): Map<string, { lane: number; total: number }> {
  const sorted = [...evs].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const laneEnd: number[] = [];
  const laneMap = new Map<string, number>();

  for (const ev of sorted) {
    let lane = 0;
    while ((laneEnd[lane] ?? 0) > ev.startMin) lane++;
    laneMap.set(ev.id, lane);
    laneEnd[lane] = ev.endMin;
  }

  const vals = [...laneMap.values()];
  const maxLane = vals.length > 0 ? Math.max(...vals) : 0;
  const result = new Map<string, { lane: number; total: number }>();
  for (const [id, lane] of laneMap) result.set(id, { lane, total: maxLane + 1 });
  return result;
}

// ── WeeklySlots ↔ GridEvent ────────────────────────────────────────────────────

export function slotsToGridEvents(slots: WeeklySlots): GridEvent[] {
  const out: GridEvent[] = [];
  let uid = 0;
  for (const [dowStr, daySlots] of Object.entries(slots)) {
    const dow = Number(dowStr);
    const col = DOW_TO_COL[dow];
    if (col === undefined) continue;
    for (const s of daySlots ?? []) {
      const startMin = hhmmToMin(s.start);
      const baseEnd  = hhmmToMin(s.end);
      const endMin   = baseEnd + (s.endDayOffset ?? 0) * 1440;
      out.push({
        id: `init-${dow}-${uid++}`,
        col, startMin, endMin,
        type:  s.type  ?? "available",
        label: s.label ?? "",
      });
    }
  }
  return out;
}

export function gridEventsToSlots(events: GridEvent[]): Record<string, TimeSlot[]> {
  const out: Record<string, TimeSlot[]> = {};
  for (const ev of events) {
    const dow = COL_TO_DOW[ev.col];
    if (dow === undefined) continue;
    const endDayOffset = Math.floor(ev.endMin / 1440);
    const slot: TimeSlot = {
      start: minToHHmm(ev.startMin),
      end:   minToHHmm(ev.endMin % 1440),
      ...(endDayOffset ? { endDayOffset } : {}),
      type:  ev.type,
      ...(ev.label ? { label: ev.label } : {}),
    };
    (out[String(dow)] ??= []).push(slot);
  }
  return out;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  events: GridEvent[];
  onChange: (events: GridEvent[]) => void;
}

export function WeeklyGrid({ events, onChange }: Props) {
  const [drag, setDrag]           = useState<DragState>({ kind: "idle" });
  const [editState, setEditState] = useState<SlotEditState | null>(null);

  const dragRef       = useRef<DragState>({ kind: "idle" });
  const eventsRef     = useRef<GridEvent[]>(events);
  const editStateRef  = useRef<SlotEditState | null>(null);
  const scrollRef     = useRef<HTMLDivElement>(null);
  const bodyRef       = useRef<HTMLDivElement>(null);
  const autoScrollDir = useRef<-1 | 0 | 1>(0);
  const autoScrollRAF = useRef<number>(0);
  const pointerMoved  = useRef(false);
  const extendedRef    = useRef(false);
  // Peak tracks max extraSlots reached this drag — zone never shrinks mid-drag (prevents scroll snap)
  const yellowPeakRef  = useRef(0);

  useEffect(() => { dragRef.current      = drag;      }, [drag]);
  useEffect(() => { eventsRef.current    = events;    }, [events]);
  useEffect(() => { editStateRef.current = editState; }, [editState]);

  // Scroll to 8pm on first mount only
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => { el.scrollTop = minToPx(20 * 60); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Yellow zone height ───────────────────────────────────────────────────────

  const extraSlots = useMemo(() => {
    const d = drag;
    // Yellow zone only appears when creating a new event past midnight
    if (d.kind !== "creating") {
      extendedRef.current = false;
      yellowPeakRef.current = 0;
      return 0;
    }

    // Horizontal drags (cross-column) never show the yellow zone
    if (d.isHorizontalDrag) { extendedRef.current = false; yellowPeakRef.current = 0; return 0; }

    const maxEnd = d.endMin;
    if (maxEnd > 1440) extendedRef.current = true;

    if (!extendedRef.current) {
      yellowPeakRef.current = 0;
      return 0;
    }

    const slots = Math.min(48, Math.max(2, maxEnd > 1440 ? Math.ceil((maxEnd - 1440) / SNAP) : 2));
    // Never shrink mid-drag — only grow. Prevents totalGridH from decreasing → prevents scroll snap.
    yellowPeakRef.current = Math.max(yellowPeakRef.current, slots);
    return yellowPeakRef.current;
  }, [drag]);

  const totalGridH = GRID_H + extraSlots * SLOT_H;

  // ── Coordinate helpers ───────────────────────────────────────────────────────
  // getBoundingClientRect() is already viewport-relative and accounts for scroll.
  // Adding scrollTop would double-count it — do NOT add it.

  const getGridY = useCallback((e: PointerEvent | ReactPointerEvent): number => {
    const body = bodyRef.current;
    if (!body) return 0;
    return Math.max(0, e.clientY - body.getBoundingClientRect().top);
  }, []);

  const getCol = useCallback((e: PointerEvent | ReactPointerEvent): number => {
    const body = bodyRef.current;
    if (!body) return 0;
    const rect = body.getBoundingClientRect();
    return clamp(Math.floor((e.clientX - rect.left) / (rect.width / 7)), 0, 6);
  }, []);

  // ── Auto-scroll ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (drag.kind === "idle") return;
    const loop = () => {
      const dir = autoScrollDir.current;
      if (dir !== 0 && scrollRef.current) scrollRef.current.scrollTop += dir * 10;
      autoScrollRAF.current = requestAnimationFrame(loop);
    };
    autoScrollRAF.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(autoScrollRAF.current);
  }, [drag.kind]);

  // ── Document pointer handlers (active only while dragging) ──────────────────

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (d.kind === "idle") return;
    pointerMoved.current = true;

    const y      = getGridY(e);
    const rawMin = pxToMin(y);

    if (scrollRef.current) {
      const r = scrollRef.current.getBoundingClientRect();
      autoScrollDir.current =
        e.clientY > r.bottom - 50 ? 1 :
        e.clientY < r.top    + 50 ? -1 : 0;
    }

    if (d.kind === "creating") {
      const cursorCol = getCol(e);
      const cur       = snapMin(clamp(rawMin, 0, 1440 - SNAP));
      let next: DragState;

      if (cursorCol === d.anchorCol) {
        // ── Vertical drag in anchor column (normal + yellow zone past midnight) ──
        const curV     = snapMin(clamp(rawMin, 0, 1440 + MAX_DRAG - SNAP));
        const startMin = Math.min(d.anchorMin, curV);
        const endMin   = Math.max(d.anchorMin + SNAP, curV + SNAP);
        next = { ...d, col: d.anchorCol, startMin, endMin, isHorizontalDrag: false };

      } else if (cursorCol > d.anchorCol) {
        // ── Right drag: start at anchorMin in anchorCol, end at cursor position in cursorCol ──
        const colDiff = cursorCol - d.anchorCol;
        const endMin  = Math.max(colDiff * 1440 + cur, d.anchorMin + SNAP);
        next = { ...d, col: d.anchorCol, startMin: d.anchorMin, endMin, isHorizontalDrag: true };

      } else {
        // ── Left drag: start at cursor position in cursorCol, end at anchorMin in anchorCol ──
        const colDiff = d.anchorCol - cursorCol;
        const endMin  = colDiff * 1440 + d.anchorMin;
        next = { ...d, col: cursorCol, startMin: cur, endMin, isHorizontalDrag: true };
      }
      dragRef.current = next; setDrag(next);
    }
    if (d.kind === "moving") {
      const dur      = d.endMin - d.startMin;
      const startMin = snapMin(clamp(rawMin - d.offsetMin, 0, 1440 - SNAP));
      const next: DragState = { ...d, col: getCol(e), startMin, endMin: startMin + dur };
      dragRef.current = next; setDrag(next);
    }
    if (d.kind === "resizing-start") {
      const next: DragState = { ...d, startMin: snapMin(clamp(rawMin, 0, d.endMin - SNAP)) };
      dragRef.current = next; setDrag(next);
    }
    if (d.kind === "resizing-end") {
      const yOffset = d.yOffset ?? 0;
      const next: DragState = { ...d, endMin: snapMin(clamp(rawMin + yOffset, d.startMin + SNAP, 1440 + MAX_DRAG)) };
      dragRef.current = next; setDrag(next);
    }
  }, [getGridY, getCol]);

  const handlePointerUp = useCallback(() => {
    const d   = dragRef.current;
    const evs = eventsRef.current;
    autoScrollDir.current = 0;

    if (d.kind === "creating" && d.endMin > d.startMin) {
      onChange([...evs, { id: `ev-${Date.now()}`, col: d.col, startMin: d.startMin, endMin: d.endMin, type: "available", label: "" }]);
    }
    if (d.kind === "moving") {
      const dur = d.endMin - d.startMin;
      onChange(evs.map(ev => ev.id !== d.id ? ev : { ...ev, col: d.col, startMin: d.startMin, endMin: d.startMin + dur }));
    }
    if (d.kind === "resizing-start" || d.kind === "resizing-end") {
      onChange(evs.map(ev => ev.id !== d.id ? ev : { ...ev, startMin: d.startMin, endMin: d.endMin }));
    }

    dragRef.current = { kind: "idle" }; setDrag({ kind: "idle" });
  }, [onChange]);

  useEffect(() => {
    if (drag.kind === "idle") return;
    document.addEventListener("pointermove",   handlePointerMove);
    document.addEventListener("pointerup",     handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
    return () => {
      document.removeEventListener("pointermove",   handlePointerMove);
      document.removeEventListener("pointerup",     handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [drag.kind, handlePointerMove, handlePointerUp]);

  // ── Drag initiation ─────────────────────────────────────────────────────────

  const handleGridPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // If the edit popover is open, let its own mousedown handler close it — don't create events
    if (editStateRef.current !== null) return;
    if ((e.target as HTMLElement).closest("[data-event-id]"))      return;
    if ((e.target as HTMLElement).closest("[data-resize-handle]")) return;
    e.preventDefault();
    pointerMoved.current = false;
    const anchorMin = snapMin(clamp(pxToMin(getGridY(e)), 0, 1440 - SNAP));
    const col = getCol(e);
    const next: DragState = { kind: "creating", anchorCol: col, col, anchorMin, startMin: anchorMin, endMin: anchorMin + SNAP };
    dragRef.current = next; setDrag(next);
  }, [getGridY, getCol]);

  const handleEventPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>, ev: GridEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    pointerMoved.current = false;
    const next: DragState = { kind: "moving", id: ev.id, col: ev.col, startMin: ev.startMin, endMin: ev.endMin, offsetMin: snapMin(pxToMin(getGridY(e)) - ev.startMin) };
    dragRef.current = next; setDrag(next);
  }, [getGridY]);

  const handleResizeStartDown = useCallback((e: ReactPointerEvent<HTMLDivElement>, ev: GridEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    pointerMoved.current = false;
    const next: DragState = { kind: "resizing-start", id: ev.id, col: ev.col, startMin: ev.startMin, endMin: ev.endMin };
    dragRef.current = next; setDrag(next);
  }, []);

  const handleResizeEndDown = useCallback((e: ReactPointerEvent<HTMLDivElement>, ev: GridEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    pointerMoved.current = false;
    const next: DragState = { kind: "resizing-end", id: ev.id, col: ev.col, startMin: ev.startMin, endMin: ev.endMin };
    dragRef.current = next; setDrag(next);
  }, []);

  // Resize the END of an overnight event from its continuation block in the next column.
  // yOffset=1440 shifts rawMin (measured from grid top = midnight of the original day) by one day.
  const handleContinuationResizeEndDown = useCallback((e: ReactPointerEvent<HTMLDivElement>, ev: GridEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    pointerMoved.current = false;
    const next: DragState = { kind: "resizing-end", id: ev.id, col: ev.col, startMin: ev.startMin, endMin: ev.endMin, yOffset: 1440 };
    dragRef.current = next; setDrag(next);
  }, []);

  const handleEventClick = useCallback((e: React.MouseEvent<HTMLDivElement>, ev: GridEvent) => {
    if (pointerMoved.current) return;
    e.stopPropagation();
    setEditState({
      eventId:      ev.id,
      anchorRect:   e.currentTarget.getBoundingClientRect(),
      day:          COL_TO_DOW[ev.col] ?? 1,
      startHHmm:    minToHHmm(ev.startMin),
      endHHmm:      minToHHmm(ev.endMin % 1440),
      endDayOffset: ev.endMin >= 1440 ? 1 : 0,
      type:         ev.type,
      label:        ev.label,
    });
  }, []);

  // ── Edit popover ────────────────────────────────────────────────────────────

  const handleEditSave = useCallback((
    updates: Pick<SlotEditState, "startHHmm" | "endHHmm" | "endDayOffset" | "type" | "label">,
  ) => {
    if (!editState) return;
    onChange(events.map(ev => ev.id !== editState.eventId ? ev : {
      ...ev,
      startMin: hhmmToMin(updates.startHHmm),
      endMin:   hhmmToMin(updates.endHHmm) + (updates.endDayOffset ? 1440 : 0),
      type:     updates.type,
      label:    updates.label,
    }));
    setEditState(null);
  }, [editState, events, onChange]);

  const handleEditDelete = useCallback(() => {
    if (!editState) return;
    onChange(events.filter(ev => ev.id !== editState.eventId));
    setEditState(null);
  }, [editState, events, onChange]);

  // ── Live events (merge drag visual into committed state) ────────────────────

  const liveEvents = useMemo((): GridEvent[] => {
    const d = drag;
    if (d.kind === "idle") return events;
    if (d.kind === "creating") {
      return [...events, { id: "__ghost__", col: d.col, startMin: d.startMin, endMin: d.endMin, type: "available", label: "" }];
    }
    return events.map(ev => {
      if (!("id" in d) || ev.id !== d.id) return ev;
      return { ...ev, col: "col" in d ? d.col : ev.col, startMin: d.startMin, endMin: d.endMin };
    });
  }, [drag, events]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const isActiveDrag = drag.kind !== "idle" && "id" in drag;

  return (
    <div className="select-none rounded-lg border overflow-hidden">
      {/*
        Header and body both live inside the same scroll container so they share
        the same effective content width (both subtract the same scrollbar width).
        This keeps column headers pixel-aligned with the grid below.
      */}
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: 640 }}>

        {/* Sticky day header */}
        <div
          className="sticky top-0 z-20 bg-background border-b"
          style={{ display: "grid", gridTemplateColumns: "52px repeat(7, 1fr)" }}
        >
          <div className="border-r" />
          {COL_LABELS.map(name => (
            <div key={name} className="py-2 text-center text-xs font-semibold text-muted-foreground border-l">
              {name}
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div style={{ display: "grid", gridTemplateColumns: "52px 1fr" }}>

          {/* Time labels */}
          <div className="relative border-r" style={{ height: totalGridH }}>
            {/* Time labels 12am…12am (h=0 sits below the midnight line so it's not hidden under the header) */}
            {Array.from({ length: 25 }, (_, h) => (
              <div
                key={h}
                className={[
                  "absolute right-2 text-[11px] text-muted-foreground pointer-events-none",
                  h === 0 ? "translate-y-1" : "-translate-y-2.5",
                ].join(" ")}
                style={{ top: minToPx(h * 60) }}
              >
                {hourLabel(h)}
              </div>
            ))}
            {/* Yellow zone labels: 1am, 2am … (midnight label already shown above at h=24) */}
            {extraSlots > 1 && Array.from({ length: Math.ceil(extraSlots / 2) }, (_, i) => (
              <div
                key={`yz-${i}`}
                className="absolute right-2 text-[11px] text-muted-foreground/50 -translate-y-2.5 pointer-events-none"
                style={{ top: GRID_H + minToPx((i + 1) * 60) }}
              >
                {hourLabel(i + 1)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div
            ref={bodyRef}
            style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", height: totalGridH }}
            onPointerDown={handleGridPointerDown}
          >
            {Array.from({ length: 7 }, (_, col) => {
              // Primary events: start in this column
              const primary = liveEvents.filter(e => e.col === col);

              // Continuation events: overnight events from the LEFT column (previous day)
              // shown at the TOP of this column (midnight → end time)
              // Find events that start in an earlier column and extend into this one.
              // Handles overnight (±1 col) and multi-day (±N cols) events.
              const continuations = liveEvents.filter(e => {
                if (e.endMin <= 1440) return false;
                if (e.id === "__ghost__" && !(drag.kind === "creating" && drag.isHorizontalDrag)) return false;
                if (drag.kind === "moving" && (drag as { id: string }).id === e.id) return false;
                // Sun(col=6) → Mon(col=0) overnight wrap: always 1 day ahead
                if (e.col === 6 && col === 0) return e.endMin > 1440;
                // Linear multi-day: event starts to the left, check if it reaches this column
                if (e.col < col) return Math.floor(e.endMin / 1440) >= col - e.col;
                return false;
              });

              // Yellow zone context: RIGHT column's (next day's) early-morning events
              // shown dimmed in this column's extended area during drag
              const nextCol = (col + 1) % 7;
              const contextEvs = extraSlots > 0
                ? liveEvents.filter(e =>
                    e.col === nextCol &&
                    e.startMin < extraSlots * SNAP &&
                    e.id !== "__ghost__" &&
                    !(isActiveDrag && (drag as { id: string }).id === e.id)
                  )
                : [];

              // Lane assignment: primary events + continuations combined
              const laneInput = [
                ...primary.map(e => ({
                  id: e.id,
                  startMin: e.startMin,
                  endMin: (e.id === "__ghost__" || (isActiveDrag && (drag as { id: string }).id === e.id))
                    ? e.endMin : Math.min(e.endMin, 1440),
                })),
                ...continuations.map(e => ({
                  id: `cont-${e.id}`,
                  startMin: 0,
                  endMin: Math.min(e.endMin - colDiffAhead(e.col, col) * 1440, 1440),
                })),
              ];
              const lanes = assignLanes(laneInput);

              return (
                <div
                  key={col}
                  className="relative border-l"
                  style={{ height: totalGridH, overflow: "hidden" }}
                >
                  {/* ── Slot rows (green zone) ──────────────────────────────── */}
                  {Array.from({ length: SLOTS }, (_, i) => (
                    <div
                      key={i}
                      className={[
                        "absolute inset-x-0 border-b",
                        // i=odd → bottom of slot is an hour boundary → more visible
                        i % 2 === 1 ? "border-border/50" : "border-border/15",
                      ].join(" ")}
                      style={{ top: i * SLOT_H, height: SLOT_H }}
                    />
                  ))}

                  {/* ── Yellow zone ─────────────────────────────────────────── */}
                  {extraSlots > 0 && (
                    <>
                      {/* Background rows */}
                      {Array.from({ length: extraSlots }, (_, i) => (
                        <div
                          key={`yz-${i}`}
                          className={[
                            "absolute inset-x-0 bg-amber-950/20 border-b",
                            i % 2 === 1 ? "border-border/30" : "border-border/10",
                          ].join(" ")}
                          style={{ top: GRID_H + i * SLOT_H, height: SLOT_H }}
                        />
                      ))}

                      {/* Midnight separator with shifted day label */}
                      <div
                        className="absolute inset-x-0 border-t-2 border-border/60 z-10 flex items-center justify-center pointer-events-none"
                        style={{ top: GRID_H, height: 18 }}
                      >
                        <span className="text-[9px] font-semibold text-muted-foreground/60 bg-background/80 px-1 rounded-sm">
                          {COL_LABELS[nextCol]}
                        </span>
                      </div>

                      {/* Context events from the next column (dimmed, non-interactive) */}
                      {contextEvs.map(ev => {
                        const ctxTop    = GRID_H + minToPx(ev.startMin);
                        const ctxBottom = GRID_H + Math.min(minToPx(ev.endMin), extraSlots * SLOT_H);
                        const ctxH      = Math.max(ctxBottom - ctxTop, SLOT_H);
                        return (
                          <div
                            key={`ctx-${ev.id}`}
                            className="absolute rounded pointer-events-none"
                            style={{
                              top:             ctxTop,
                              height:          ctxH,
                              left:            "2%",
                              width:           "96%",
                              backgroundColor: ev.type === "available" ? "#22c55e" : "#ef4444",
                              opacity:         0.28,
                              border:          `1px solid ${ev.type === "available" ? "#16a34a" : "#dc2626"}`,
                            }}
                          />
                        );
                      })}
                    </>
                  )}

                  {/* ── Continuation blocks (top of column, from prev-col overnight) ── */}
                  {continuations.map(ev => {
                    const fakeId    = `cont-${ev.id}`;
                    const layout    = lanes.get(fakeId) ?? { lane: 0, total: 1 };
                    const laneW     = 100 / layout.total;
                    const contEnd   = Math.min(ev.endMin - colDiffAhead(ev.col, col) * 1440, 1440);
                    const height    = Math.max(minToPx(contEnd), SLOT_H);
                    const bg     = ev.type === "available" ? "#22c55e" : "#ef4444";
                    const bdr    = ev.type === "available" ? "#16a34a" : "#dc2626";
                    return (
                      <div
                        key={fakeId}
                        data-event-id={ev.id}
                        className="absolute rounded overflow-hidden flex flex-col z-10 cursor-pointer hover:brightness-110 transition-[filter]"
                        style={{
                          top:             0,
                          height,
                          left:            `${layout.lane * laneW + 0.5}%`,
                          width:           `${laneW - 1}%`,
                          backgroundColor: bg,
                          border:          `1px solid ${bdr}`,
                          borderTop:       `3px solid ${bdr}`,
                        }}
                        onPointerDown={e => { e.stopPropagation(); pointerMoved.current = false; }}
                        onClick={e => handleEventClick(e, ev)}
                      >
                        <div className="px-1.5 pt-1 pointer-events-none min-h-0 overflow-hidden flex-1">
                          <span className="text-[11px] font-semibold text-white/80 leading-tight truncate block">
                            → {minToHHmm(ev.endMin % 1440)}
                          </span>
                          {ev.label && (
                            <span className="text-[11px] text-white/70 leading-tight truncate block">{ev.label}</span>
                          )}
                        </div>
                        {/* Bottom resize handle */}
                        <div
                          data-resize-handle="end"
                          className="absolute bottom-0 inset-x-0 h-2.5 cursor-s-resize z-30 group flex items-end justify-center"
                          onPointerDown={e => handleContinuationResizeEndDown(e, ev)}
                        >
                          <div className="mb-0.5 w-6 h-0.5 rounded-full bg-white/30 group-hover:bg-white/70 transition-colors" />
                        </div>
                      </div>
                    );
                  })}

                  {/* ── Primary events (start in this column) ──────────────── */}
                  {primary.map(ev => {
                    const layout    = lanes.get(ev.id) ?? { lane: 0, total: 1 };
                    const laneW     = 100 / layout.total;
                    const isGhost   = ev.id === "__ghost__";
                    // Don't treat the source block as "active" when resizing from its continuation —
                    // the continuation block is the one that should grow, not the source.
                    const isContinuationResize =
                      drag.kind === "resizing-end" &&
                      (drag as { yOffset?: number }).yOffset === 1440 &&
                      (drag as { id: string }).id === ev.id;
                    const isActive  = !isGhost && isActiveDrag && (drag as { id: string }).id === ev.id && !isContinuationResize;
                    // Horizontal drags: ghost clips at midnight; continuation block shows the rest
                    const showFull  = isGhost
                      ? !(drag.kind === "creating" && drag.isHorizontalDrag)
                      : isActive;
                    // Committed overnight events: clip at midnight; "+1" in label tells the story.
                    // Ghost/active drag: show full height so the yellow zone extends naturally.
                    const dispEnd   = showFull ? ev.endMin : Math.min(ev.endMin, 1440);
                    const top       = minToPx(ev.startMin);
                    const height    = Math.max(minToPx(dispEnd - ev.startMin), SLOT_H);
                    const bg        = ev.type === "available" ? "#22c55e" : "#ef4444";
                    const bdr       = ev.type === "available" ? "#16a34a" : "#dc2626";
                    // Committed overnight: flat bottom edge (continuation block in next col takes over)
                    const btmRadius = !showFull && ev.endMin > 1440 ? "0 0 0 0" : undefined;

                    return (
                      <div
                        key={ev.id}
                        data-event-id={ev.id}
                        className={[
                          "absolute flex flex-col overflow-hidden",
                          isGhost || isActive
                            ? "opacity-80 shadow-lg z-20 rounded"
                            : "z-10 hover:brightness-110 transition-[filter] rounded",
                          isGhost ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing",
                        ].join(" ")}
                        style={{
                          top, height,
                          left:            `${layout.lane * laneW + 0.5}%`,
                          width:           `${laneW - 1}%`,
                          backgroundColor: bg,
                          border:          `1px solid ${bdr}`,
                          borderRadius:    btmRadius
                            ? `4px 4px ${btmRadius}`
                            : undefined,
                        }}
                        onPointerDown={isGhost ? undefined : e => handleEventPointerDown(e, ev)}
                        onClick={isGhost        ? undefined : e => handleEventClick(e, ev)}
                      >
                        {/* Top resize handle */}
                        {!isGhost && (
                          <div
                            data-resize-handle="start"
                            className="absolute top-0 inset-x-0 h-2.5 cursor-n-resize z-30 group flex items-start justify-center"
                            onPointerDown={e => handleResizeStartDown(e, ev)}
                          >
                            <div className="mt-0.5 w-6 h-0.5 rounded-full bg-white/30 group-hover:bg-white/70 transition-colors" />
                          </div>
                        )}

                        {/* Label */}
                        <div className="px-1.5 pt-2.5 pb-1 flex flex-col gap-0.5 pointer-events-none min-h-0 overflow-hidden">
                          <span className="text-[11px] font-semibold text-white leading-tight truncate">
                            {minToHHmm(ev.startMin)}
                            {" – "}
                            {minToHHmm(ev.endMin % 1440)}
                            {ev.endMin >= 1440 ? " +1" : ""}
                          </span>
                          {ev.label && (
                            <span className="text-[11px] text-white/85 leading-tight truncate">{ev.label}</span>
                          )}
                        </div>

                        {/* Bottom resize handle */}
                        {!isGhost && (
                          <div
                            data-resize-handle="end"
                            className="absolute bottom-0 inset-x-0 h-2.5 cursor-s-resize z-30 group flex items-end justify-center"
                            onPointerDown={e => handleResizeEndDown(e, ev)}
                          >
                            <div className="mb-0.5 w-6 h-0.5 rounded-full bg-white/30 group-hover:bg-white/70 transition-colors" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {editState && (
        <SlotEditPopover
          state={editState}
          onClose={() => setEditState(null)}
          onSave={handleEditSave}
          onDelete={handleEditDelete}
        />
      )}
    </div>
  );
}
