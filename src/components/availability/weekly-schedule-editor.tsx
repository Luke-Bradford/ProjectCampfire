"use client";

import { useState, useEffect } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import type { WeeklySlots } from "@/server/db/schema/availability";
import { toast } from "sonner";
import {
  WeeklyGrid,
  slotsToGridEvents,
  gridEventsToSlots,
  type GridEvent,
} from "./weekly-grid";

// ── Timezone list ──────────────────────────────────────────────────────────────
const ALL_TIMEZONES: string[] = (() => {
  try { return Intl.supportedValuesOf("timeZone"); }
  catch { return ["UTC", "Europe/London", "America/New_York", "America/Los_Angeles"]; }
})();

// ── Component ──────────────────────────────────────────────────────────────────

export function WeeklyScheduleEditor() {
  const utils = api.useUtils();
  const { data: schedule, error: scheduleError } = api.availability.getSchedule.useQuery();

  const [timezone, setTimezone] = useState<string>(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
  });
  const [events, setEvents]   = useState<GridEvent[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Load saved schedule
  useEffect(() => {
    if (schedule) {
      setTimezone(schedule.timezone);
      setEvents(slotsToGridEvents(schedule.slots as WeeklySlots));
      setIsDirty(false);
    }
  }, [schedule]);

  const handleChange = (next: GridEvent[]) => {
    setEvents(next);
    setIsDirty(true);
  };

  const upsert = api.availability.upsertSchedule.useMutation({
    onSuccess: () => {
      setIsDirty(false);
      void utils.availability.getSchedule.invalidate();
      void utils.availability.computed.invalidate();
      toast.success("Schedule saved");
    },
    onError: (e) => toast.error(`Save failed: ${e.message}`),
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="tz-input" className="text-sm font-medium whitespace-nowrap">Timezone:</label>
          <input
            id="tz-input"
            list="tz-list"
            value={timezone}
            onChange={e => { setTimezone(e.target.value); setIsDirty(true); }}
            className="h-9 w-[220px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="e.g. Europe/London"
          />
          <datalist id="tz-list">
            {ALL_TIMEZONES.map(tz => <option key={tz} value={tz} />)}
          </datalist>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => { setEvents([]); setIsDirty(true); }}
            disabled={events.length === 0 && !isDirty}
          >
            Clear all
          </Button>
          <Button
            size="sm"
            onClick={() => upsert.mutate({ timezone, slots: gridEventsToSlots(events) })}
            disabled={!isDirty || upsert.isPending}
          >
            {upsert.isPending ? "Saving…" : "Save schedule"}
          </Button>
        </div>
      </div>

      {scheduleError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {scheduleError.message}
        </p>
      )}

      <WeeklyGrid events={events} onChange={handleChange} />

      <p className="text-xs text-muted-foreground">
        Drag to add a block · Drag edges to resize · Drag a block to move · Click a block to edit or delete.
        Drag past midnight to schedule late-night sessions — the grid extends as you go.
        Repeats every week.
      </p>
    </div>
  );
}
