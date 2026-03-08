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

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Only show 6am-midnight by default (cells 12-48)
const VISIBLE_START = 12;
const VISIBLE_END = 48;

function cellToTimeLabel(cell: number): string {
  const h = Math.floor(cell / 2);
  const m = (cell % 2) * 30;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Common timezones for the selector
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

  // Grid state: one Set<number> per day (0-6)
  const [grid, setGrid] = useState<Map<number, Set<number>>>(new Map());
  const [isDirty, setIsDirty] = useState(false);
  const [isPainting, setIsPainting] = useState(false);
  const paintModeRef = useRef<boolean>(true); // true = adding, false = removing
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

  const toggleCell = useCallback(
    (day: number, cell: number, mode?: boolean) => {
      setGrid((prev) => {
        const next = new Map(prev);
        const dayCells = new Set(prev.get(day) ?? []);
        const shouldAdd = mode ?? !dayCells.has(cell);
        if (shouldAdd) {
          dayCells.add(cell);
        } else {
          dayCells.delete(cell);
        }
        next.set(day, dayCells);
        return next;
      });
      setIsDirty(true);
    },
    []
  );

  const handlePointerDown = useCallback(
    (day: number, cell: number) => {
      const dayCells = grid.get(day) ?? new Set();
      paintModeRef.current = !dayCells.has(cell);
      setIsPainting(true);
      toggleCell(day, cell, paintModeRef.current);
    },
    [grid, toggleCell]
  );

  const handlePointerEnter = useCallback(
    (day: number, cell: number) => {
      if (!isPainting) return;
      toggleCell(day, cell, paintModeRef.current);
    },
    [isPainting, toggleCell]
  );

  useEffect(() => {
    const handleUp = () => setIsPainting(false);
    window.addEventListener("pointerup", handleUp);
    return () => window.removeEventListener("pointerup", handleUp);
  }, []);

  const upsert = api.availability.upsertSchedule.useMutation({
    onSuccess: () => {
      setIsDirty(false);
      void utils.availability.getSchedule.invalidate();
      void utils.availability.computed.invalidate();
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
          <Button variant="outline" size="sm" onClick={handleClear} disabled={!isDirty && grid.size === 0}>
            Clear all
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isDirty || upsert.isPending}>
            {upsert.isPending ? "Saving..." : "Save schedule"}
          </Button>
        </div>
      </div>

      {!schedule && !isDirty && (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Drag across the grid below to paint your typical free hours. This repeats every week automatically.
        </div>
      )}

      <div
        ref={gridRef}
        className="select-none overflow-x-auto rounded-lg border"
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Header row */}
        <div className="grid" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
          <div className="border-b border-r bg-muted/50 p-2" />
          {DAYS.map((day) => (
            <div
              key={day}
              className="border-b bg-muted/50 p-2 text-center text-xs font-medium"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Time slots */}
        {Array.from({ length: VISIBLE_END - VISIBLE_START }, (_, i) => {
          const cell = VISIBLE_START + i;
          const isHour = cell % 2 === 0;
          return (
            <div
              key={cell}
              className="grid"
              style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}
            >
              <div
                className={`border-r px-2 py-0 text-right text-[10px] text-muted-foreground ${
                  isHour ? "border-t" : ""
                }`}
              >
                {isHour ? cellToTimeLabel(cell) : ""}
              </div>
              {DAYS.map((_, dayIdx) => {
                const isSelected = grid.get(dayIdx)?.has(cell) ?? false;
                return (
                  <div
                    key={dayIdx}
                    className={`h-[18px] border-r transition-colors cursor-pointer ${
                      isHour ? "border-t border-t-border/50" : ""
                    } ${
                      isSelected
                        ? "bg-emerald-400/80 dark:bg-emerald-600/80"
                        : "hover:bg-muted/50"
                    }`}
                    onPointerDown={() => handlePointerDown(dayIdx, cell)}
                    onPointerEnter={() => handlePointerEnter(dayIdx, cell)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Click and drag to paint your free hours. These repeat every week. Use the Calendar tab to make
        per-date adjustments.
      </p>
    </div>
  );
}
