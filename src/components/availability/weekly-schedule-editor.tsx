"use client";

/**
 * WeeklyScheduleEditor
 *
 * Key design decisions:
 * - The grid is rendered once as static HTML. Cell background colours are
 *   updated by mutating classList directly (no React state during drag).
 *   React state is only written on pointerup, keeping drag smooth.
 * - Pointer capture is NOT used because it prevents the container from
 *   scrolling mid-drag. Instead we listen on window for pointermove/up.
 * - The scroll container has a fixed height and the grid never re-renders
 *   during painting, so there are no layout shifts.
 */

import { useState, useRef, useEffect } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { cellsToSlots, slotsToCell } from "@/lib/availability-utils";
import type { WeeklySlots } from "@/server/db/schema/availability";
import { toast } from "sonner";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TOTAL_CELLS = 48;        // 30 min × 48 = 24 h
const DEFAULT_SCROLL_CELL = 38; // show 19:00 on load
const CELL_H = 18;              // px per row — must match CSS
const HEADER_H = 32;            // px for sticky header row

// Module-level timezone list (computed once, not on render)
const ALL_TIMEZONES: string[] = (() => {
  try { return Intl.supportedValuesOf("timeZone"); }
  catch { return ["UTC", "Europe/London", "America/New_York", "America/Los_Angeles"]; }
})();

function toTimeLabel(cell: number) {
  const h = Math.floor(cell / 2);
  const m = (cell % 2) * 30;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ── Cell ref helpers ─────────────────────────────────────────────────────────
// Each cell has id="cell-{day}-{cell}" so we can reach it without React state.
function cellId(day: number, cell: number) { return `cell-${day}-${cell}`; }

function setCellSelected(day: number, cell: number, selected: boolean) {
  const el = document.getElementById(cellId(day, cell));
  if (!el) return;
  el.classList.toggle("bg-emerald-400/80", selected);
  el.classList.toggle("dark:bg-emerald-600/80", selected);
}

export function WeeklyScheduleEditor() {
  const utils = api.useUtils();
  const { data: schedule, isLoading } = api.availability.getSchedule.useQuery();

  const [timezone, setTimezone] = useState<string>(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
  });

  // The committed grid state — only updated on pointerup or when schedule loads
  const committedRef = useRef<Map<number, Set<number>>>(new Map());
  const [isDirty, setIsDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Painting state — stored in refs so we don't re-render during drag
  const paintingRef = useRef(false);
  const paintModeRef = useRef(true); // true = add, false = remove
  // Tracks cells painted this stroke so we don't double-toggle
  const strokeRef = useRef<Set<string>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // ── Load schedule into DOM and committedRef ─────────────────────────────
  useEffect(() => {
    if (!schedule) return;
    setTimezone(schedule.timezone);
    const newGrid = new Map<number, Set<number>>();
    const slots = schedule.slots as WeeklySlots;
    for (let day = 0; day < 7; day++) {
      newGrid.set(day, slotsToCell(slots[day] ?? []));
    }
    committedRef.current = newGrid;
    setIsDirty(false);

    // Sync DOM to loaded state
    for (let day = 0; day < 7; day++) {
      const cells = newGrid.get(day) ?? new Set<number>();
      for (let cell = 0; cell < TOTAL_CELLS; cell++) {
        setCellSelected(day, cell, cells.has(cell));
      }
    }
  }, [schedule]);

  // ── Pre-scroll to 19:00 once grid has rendered ──────────────────────────
  useEffect(() => {
    if (!isLoading && scrollRef.current) {
      // +HEADER_H because the header is sticky inside the scroll container
      scrollRef.current.scrollTop = DEFAULT_SCROLL_CELL * CELL_H;
    }
  }, [isLoading]);

  // ── Coordinate → (day, cell) from pointer event ─────────────────────────
  function hitTest(clientX: number, clientY: number): { day: number; cell: number } | null {
    const scroll = scrollRef.current;
    if (!scroll) return null;
    const rect = scroll.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top + scroll.scrollTop;
    if (x < 60) return null;
    const colW = (rect.width - 60) / 7;
    const day = Math.floor((x - 60) / colW);
    const cell = Math.floor((y - HEADER_H) / CELL_H);
    if (day < 0 || day > 6 || cell < 0 || cell >= TOTAL_CELLS) return null;
    return { day, cell };
  }

  // ── Pointer handlers (no React state during drag) ───────────────────────
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) return;
    const { day, cell } = hit;

    // Determine paint mode from current cell state in committedRef
    const cells = committedRef.current.get(day) ?? new Set<number>();
    paintModeRef.current = !cells.has(cell);
    paintingRef.current = true;
    strokeRef.current = new Set();

    paintCell(day, cell);
  }

  function paintCell(day: number, cell: number) {
    const key = `${day}-${cell}`;
    if (strokeRef.current.has(key)) return; // already painted this stroke
    strokeRef.current.add(key);

    const cells = committedRef.current.get(day) ?? new Set<number>();
    const adding = paintModeRef.current;

    if (adding) cells.add(cell);
    else cells.delete(cell);
    committedRef.current.set(day, cells);

    setCellSelected(day, cell, adding);
    setIsDirty(true);
  }

  // Attach global listeners so drag works outside the scroll container
  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!paintingRef.current) return;
      const hit = hitTest(e.clientX, e.clientY);
      if (hit) paintCell(hit.day, hit.cell);
    }
    function onUp() {
      paintingRef.current = false;
      strokeRef.current = new Set();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []); // refs only, no reactive deps needed

  // ── Save ────────────────────────────────────────────────────────────────
  const upsert = api.availability.upsertSchedule.useMutation({
    onSuccess: () => {
      setIsDirty(false);
      setSaveError(null);
      void utils.availability.getSchedule.invalidate();
      void utils.availability.computed.invalidate();
      toast.success("Schedule saved");
    },
    onError: (e) => {
      setSaveError(e.message);
      toast.error(`Save failed: ${e.message}`);
    },
  });

  function handleSave() {
    setSaveError(null);
    const slots: Record<string, Array<{ start: string; end: string }>> = {};
    for (let day = 0; day < 7; day++) {
      const dayCells = committedRef.current.get(day) ?? new Set<number>();
      if (dayCells.size > 0) slots[String(day)] = cellsToSlots(dayCells);
    }
    upsert.mutate({ timezone, slots });
  }

  function handleClear() {
    committedRef.current = new Map();
    for (let day = 0; day < 7; day++) {
      for (let cell = 0; cell < TOTAL_CELLS; cell++) {
        setCellSelected(day, cell, false);
      }
    }
    setIsDirty(true);
  }

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading schedule...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="tz-input" className="text-sm font-medium whitespace-nowrap">
            Timezone:
          </label>
          <input
            id="tz-input"
            list="tz-list"
            value={timezone}
            onChange={(e) => { setTimezone(e.target.value); setIsDirty(true); }}
            className="h-9 w-[220px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="e.g. Europe/London"
          />
          <datalist id="tz-list">
            {ALL_TIMEZONES.map((tz) => <option key={tz} value={tz} />)}
          </datalist>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleClear}>
            Clear all
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isDirty || upsert.isPending}>
            {upsert.isPending ? "Saving…" : "Save schedule"}
          </Button>
        </div>
      </div>

      {saveError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {saveError}
        </p>
      )}

      {!schedule && !isDirty && (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Drag across the grid to paint your free hours. Repeats every week — adjust specific dates on the Calendar tab.
        </div>
      )}

      {/* Grid — static HTML, colours updated via direct DOM */}
      <div
        ref={scrollRef}
        className="overflow-y-auto rounded-lg border select-none"
        style={{ height: "420px" }}
        onPointerDown={handlePointerDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div ref={gridRef}>
          {/* Sticky header */}
          <div
            className="sticky top-0 z-10 grid bg-background"
            style={{ gridTemplateColumns: "60px repeat(7, 1fr)", height: `${HEADER_H}px` }}
          >
            <div className="border-b border-r bg-muted/50" />
            {DAYS.map((d) => (
              <div key={d} className="flex items-center justify-center border-b bg-muted/50 text-xs font-medium">
                {d}
              </div>
            ))}
          </div>

          {/* Time rows */}
          {Array.from({ length: TOTAL_CELLS }, (_, cell) => {
            const isHour = cell % 2 === 0;
            return (
              <div
                key={cell}
                className="grid"
                style={{ gridTemplateColumns: "60px repeat(7, 1fr)", height: `${CELL_H}px` }}
              >
                <div
                  className={`border-r px-1 text-right text-[10px] leading-none text-muted-foreground${isHour ? " border-t pt-0.5" : ""}`}
                >
                  {isHour ? toTimeLabel(cell) : ""}
                </div>
                {DAYS.map((_, dayIdx) => (
                  <div
                    key={dayIdx}
                    id={cellId(dayIdx, cell)}
                    className={`border-r${isHour ? " border-t border-t-border/50" : ""}`}
                    style={{ height: `${CELL_H}px` }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Click or drag to paint free hours. These repeat every week — use the Calendar tab to adjust individual dates.
      </p>
    </div>
  );
}
