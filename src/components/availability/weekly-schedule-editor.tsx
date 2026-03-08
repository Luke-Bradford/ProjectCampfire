"use client";

import { useState, useCallback, useRef, useEffect, useMemo, memo } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { cellsToSlots, slotsToCell } from "@/lib/availability-utils";
import type { WeeklySlots } from "@/server/db/schema/availability";
import { toast } from "sonner";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TOTAL_CELLS = 48; // 48 × 30 min = full 24 hours
const DEFAULT_SCROLL_CELL = 38; // pre-scroll to 19:00
const CELL_HEIGHT = 18; // px
const HEADER_HEIGHT = 32; // px — sticky header

function cellToTimeLabel(cell: number): string {
  const h = Math.floor(cell / 2);
  const m = (cell % 2) * 30;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Built once at module load — avoids calling Intl.supportedValuesOf on every render
const ALL_TIMEZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Australia/Sydney"];
  }
})();

// ── Memoised row: only re-renders when selectedDays reference changes ─────────
type RowProps = { cell: number; selectedDays: boolean[] };

const GridRow = memo(function GridRow({ cell, selectedDays }: RowProps) {
  const isHour = cell % 2 === 0;
  return (
    <div className="grid" style={{ gridTemplateColumns: "60px repeat(7, 1fr)", height: `${CELL_HEIGHT}px` }}>
      <div className={`border-r px-2 text-right text-[10px] leading-none text-muted-foreground ${isHour ? "border-t pt-0.5" : ""}`}>
        {isHour ? cellToTimeLabel(cell) : ""}
      </div>
      {selectedDays.map((isSelected, dayIdx) => (
        <div
          key={dayIdx}
          className={`border-r ${isHour ? "border-t border-t-border/50" : ""} ${isSelected ? "bg-emerald-400/80 dark:bg-emerald-600/80" : ""}`}
        />
      ))}
    </div>
  );
});

export function WeeklyScheduleEditor() {
  const utils = api.useUtils();
  const { data: schedule, isLoading } = api.availability.getSchedule.useQuery();

  const [timezone, setTimezone] = useState<string>(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
  });

  const [grid, setGrid] = useState<Map<number, Set<number>>>(new Map());
  const [isDirty, setIsDirty] = useState(false);
  const paintModeRef = useRef<boolean>(true);
  const isPaintingRef = useRef(false);
  const lastPaintedRef = useRef<{ day: number; cell: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load schedule → grid
  useEffect(() => {
    if (schedule) {
      setTimezone(schedule.timezone);
      const newGrid = new Map<number, Set<number>>();
      const slots = schedule.slots as WeeklySlots;
      for (let day = 0; day < 7; day++) {
        newGrid.set(day, slotsToCell(slots[day] ?? []));
      }
      setGrid(newGrid);
      setIsDirty(false);
    }
  }, [schedule]);

  // Scroll to evening on mount
  useEffect(() => {
    if (scrollRef.current && !isLoading) {
      scrollRef.current.scrollTop = DEFAULT_SCROLL_CELL * CELL_HEIGHT;
    }
  }, [isLoading]);

  const toggleCell = useCallback((day: number, cell: number, addMode: boolean) => {
    setGrid((prev) => {
      const dayCells = new Set(prev.get(day) ?? []);
      if (addMode) dayCells.add(cell); else dayCells.delete(cell);
      const next = new Map(prev);
      next.set(day, dayCells);
      return next;
    });
    setIsDirty(true);
  }, []);

  // Convert pointer position → (day, cell).
  // Measure against the scroll container's viewport rect then add scrollTop.
  const getCellFromEvent = useCallback((e: React.PointerEvent<HTMLDivElement>): { day: number; cell: number } | null => {
    const scroll = scrollRef.current;
    if (!scroll) return null;
    const rect = scroll.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top + scroll.scrollTop;

    if (x < 60) return null;
    const colWidth = (rect.width - 60) / 7;
    const day = Math.floor((x - 60) / colWidth);
    const cell = Math.floor((y - HEADER_HEIGHT) / CELL_HEIGHT);

    if (day < 0 || day > 6 || cell < 0 || cell >= TOTAL_CELLS) return null;
    return { day, cell };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isPaintingRef.current = true;
    lastPaintedRef.current = null;

    const target = getCellFromEvent(e);
    if (!target) return;
    const { day, cell } = target;
    paintModeRef.current = !(grid.get(day)?.has(cell) ?? false);
    lastPaintedRef.current = target;
    toggleCell(day, cell, paintModeRef.current);
  }, [grid, getCellFromEvent, toggleCell]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPaintingRef.current) return;
    const target = getCellFromEvent(e);
    if (!target) return;
    // Skip if same cell as last painted to avoid redundant state updates
    const last = lastPaintedRef.current;
    if (last && last.day === target.day && last.cell === target.cell) return;
    lastPaintedRef.current = target;
    toggleCell(target.day, target.cell, paintModeRef.current);
  }, [getCellFromEvent, toggleCell]);

  const stopPainting = useCallback(() => { isPaintingRef.current = false; }, []);

  const upsert = api.availability.upsertSchedule.useMutation({
    onSuccess: () => {
      setIsDirty(false);
      void utils.availability.getSchedule.invalidate();
      void utils.availability.computed.invalidate();
      toast.success("Schedule saved");
    },
    onError: (e) => toast.error(`Failed to save: ${e.message}`),
  });

  const handleSave = () => {
    const slots: Record<string, Array<{ start: string; end: string }>> = {};
    for (let day = 0; day < 7; day++) {
      const dayCells = grid.get(day) ?? new Set<number>();
      if (dayCells.size > 0) slots[String(day)] = cellsToSlots(dayCells);
    }
    upsert.mutate({ timezone, slots });
  };

  // Pre-compute per-row selection so GridRow memo can bail out correctly
  const rowData = useMemo<boolean[][]>(() => {
    return Array.from({ length: TOTAL_CELLS }, (_, cell) =>
      DAYS.map((_, dayIdx) => grid.get(dayIdx)?.has(cell) ?? false)
    );
  }, [grid]);

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading schedule...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="tz-input" className="text-sm font-medium whitespace-nowrap">Timezone:</label>
          {/* Plain input + datalist renders instantly vs a 600-item Select dropdown */}
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setGrid(new Map()); setIsDirty(true); }} disabled={!isDirty && grid.size === 0}>
            Clear all
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isDirty || upsert.isPending}>
            {upsert.isPending ? "Saving..." : "Save schedule"}
          </Button>
        </div>
      </div>

      {!schedule && !isDirty && (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Drag across the grid to paint your typical free hours. This repeats every week automatically.
        </div>
      )}

      {/* Scrollable grid — fixed height, pre-scrolled to evening */}
      <div
        ref={scrollRef}
        className="overflow-y-auto rounded-lg border"
        style={{ height: "420px" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPainting}
        onPointerCancel={stopPainting}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="select-none">
          {/* Sticky day headers */}
          <div
            className="sticky top-0 z-10 grid bg-background"
            style={{ gridTemplateColumns: "60px repeat(7, 1fr)", height: `${HEADER_HEIGHT}px` }}
          >
            <div className="border-b border-r bg-muted/50" />
            {DAYS.map((day) => (
              <div key={day} className="flex items-center justify-center border-b bg-muted/50 text-xs font-medium">
                {day}
              </div>
            ))}
          </div>

          {/* 30-min rows — memoised to avoid re-rendering all 336 cells on each paint */}
          {rowData.map((selectedDays, cell) => (
            <GridRow key={cell} cell={cell} selectedDays={selectedDays} />
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Click and drag to paint your free hours. These repeat every week. Use the Calendar tab to adjust specific dates.
      </p>
    </div>
  );
}
