"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cellsToSlots, slotsToCell } from "@/lib/availability-utils";
import type { WeeklySlots } from "@/server/db/schema/availability";
import { toast } from "sonner";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Full 24-hour range — 48 cells of 30 min each
const TOTAL_CELLS = 48;
// Scroll to 19:00 by default so prime gaming hours are immediately visible
const DEFAULT_SCROLL_CELL = 38;

function cellToTimeLabel(cell: number): string {
  const h = Math.floor(cell / 2);
  const m = (cell % 2) * 30;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const COMMON_TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [
      "UTC",
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "Asia/Tokyo",
      "Australia/Sydney",
    ];
  }
})();

const CELL_HEIGHT = 18; // px — must match the style below
const HEADER_HEIGHT = 32; // px — sticky header row

export function WeeklyScheduleEditor() {
  const utils = api.useUtils();
  const { data: schedule, isLoading } = api.availability.getSchedule.useQuery();

  const [timezone, setTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "UTC";
    }
  });

  const [grid, setGrid] = useState<Map<number, Set<number>>>(new Map());
  const [isDirty, setIsDirty] = useState(false);
  const paintModeRef = useRef<boolean>(true);
  const isPaintingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Load schedule data into grid state
  useEffect(() => {
    if (schedule) {
      setTimezone(schedule.timezone);
      const newGrid = new Map<number, Set<number>>();
      const slots = schedule.slots as WeeklySlots;
      for (let day = 0; day < 7; day++) {
        const daySlots = slots[day] ?? [];
        newGrid.set(day, slotsToCell(daySlots));
      }
      setGrid(newGrid);
      setIsDirty(false);
    }
  }, [schedule]);

  // Scroll to evening on first render
  useEffect(() => {
    if (scrollRef.current && !isLoading) {
      scrollRef.current.scrollTop = DEFAULT_SCROLL_CELL * CELL_HEIGHT;
    }
  }, [isLoading]);

  const toggleCell = useCallback((day: number, cell: number, addMode: boolean) => {
    setGrid((prev) => {
      const next = new Map(prev);
      const dayCells = new Set(prev.get(day) ?? []);
      if (addMode) {
        dayCells.add(cell);
      } else {
        dayCells.delete(cell);
      }
      next.set(day, dayCells);
      return next;
    });
    setIsDirty(true);
  }, []);

  // Derive (day, cell) from pointer coordinates relative to the grid
  const getCellFromEvent = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): { day: number; cell: number } | null => {
      if (!gridRef.current) return null;
      const rect = gridRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const scrollTop = scrollRef.current?.scrollTop ?? 0;
      const y = e.clientY - rect.top + scrollTop;

      // Time label column is 60px wide
      if (x < 60) return null;

      const colWidth = (rect.width - 60) / 7;
      const day = Math.floor((x - 60) / colWidth);
      const cell = Math.floor((y - HEADER_HEIGHT) / CELL_HEIGHT);

      if (day < 0 || day > 6 || cell < 0 || cell >= TOTAL_CELLS) return null;
      return { day, cell };
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      // Capture the pointer so we keep receiving events even if the cursor
      // moves outside the element — this is what prevents cells being skipped
      e.currentTarget.setPointerCapture(e.pointerId);
      isPaintingRef.current = true;

      const target = getCellFromEvent(e);
      if (!target) return;
      const { day, cell } = target;
      const dayCells = grid.get(day) ?? new Set();
      paintModeRef.current = !dayCells.has(cell);
      toggleCell(day, cell, paintModeRef.current);
    },
    [grid, getCellFromEvent, toggleCell]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isPaintingRef.current) return;
      const target = getCellFromEvent(e);
      if (!target) return;
      toggleCell(target.day, target.cell, paintModeRef.current);
    },
    [getCellFromEvent, toggleCell]
  );

  const stopPainting = useCallback(() => {
    isPaintingRef.current = false;
  }, []);

  const upsert = api.availability.upsertSchedule.useMutation({
    onSuccess: () => {
      setIsDirty(false);
      void utils.availability.getSchedule.invalidate();
      void utils.availability.computed.invalidate();
      toast.success("Schedule saved");
    },
    onError: (e) => {
      toast.error(`Failed to save: ${e.message}`);
    },
  });

  const handleSave = () => {
    const slots: Record<string, Array<{ start: string; end: string }>> = {};
    for (let day = 0; day < 7; day++) {
      const dayCells = grid.get(day) ?? new Set<number>();
      if (dayCells.size > 0) {
        slots[String(day)] = cellsToSlots(dayCells);
      }
    }
    upsert.mutate({ timezone, slots });
  };

  const handleClear = () => {
    setGrid(new Map());
    setIsDirty(true);
  };

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading schedule...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Timezone:</span>
          <Select value={timezone} onValueChange={(v) => { setTimezone(v); setIsDirty(true); }}>
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {COMMON_TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={!isDirty && grid.size === 0}
          >
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
      >
        <div
          ref={gridRef}
          className="select-none"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopPainting}
          onPointerCancel={stopPainting}
        >
          {/* Sticky day headers */}
          <div
            className="sticky top-0 z-10 grid bg-background"
            style={{ gridTemplateColumns: "60px repeat(7, 1fr)", height: `${HEADER_HEIGHT}px` }}
          >
            <div className="border-b border-r bg-muted/50" />
            {DAYS.map((day) => (
              <div
                key={day}
                className="flex items-center justify-center border-b bg-muted/50 text-xs font-medium"
              >
                {day}
              </div>
            ))}
          </div>

          {/* 30-min rows across the full 24 hours */}
          {Array.from({ length: TOTAL_CELLS }, (_, cell) => {
            const isHour = cell % 2 === 0;
            return (
              <div
                key={cell}
                className="grid"
                style={{ gridTemplateColumns: "60px repeat(7, 1fr)", height: `${CELL_HEIGHT}px` }}
              >
                <div
                  className={`border-r px-2 text-right text-[10px] leading-none text-muted-foreground ${
                    isHour ? "border-t pt-0.5" : ""
                  }`}
                >
                  {isHour ? cellToTimeLabel(cell) : ""}
                </div>
                {DAYS.map((_, dayIdx) => {
                  const isSelected = grid.get(dayIdx)?.has(cell) ?? false;
                  return (
                    <div
                      key={dayIdx}
                      className={`border-r ${isHour ? "border-t border-t-border/50" : ""} ${
                        isSelected ? "bg-emerald-400/80 dark:bg-emerald-600/80" : ""
                      }`}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Click and drag to paint your free hours. These repeat every week. Use the Calendar tab to make
        per-date adjustments.
      </p>
    </div>
  );
}
