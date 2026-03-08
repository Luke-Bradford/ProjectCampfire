"use client";

/**
 * WeeklyScheduleEditor
 *
 * Uses FullCalendar's timeGridWeek view on a fixed "template week"
 * (2024-01-01 Mon → 2024-01-07 Sun) with no navigation.
 *
 * The user drags to create green "available" blocks. FullCalendar handles
 * all pointer logic natively — drag-to-create, resize, drag-to-move, and
 * auto-scroll when dragging near the container edge. We just convert between
 * FullCalendar events ↔ WeeklySlots on load/save.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg, EventClickArg, EventChangeArg, EventInput } from "@fullcalendar/core";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import type { WeeklySlots } from "@/server/db/schema/availability";
import { toast } from "sonner";

// ── Template week ─────────────────────────────────────────────────────────────
// We point FullCalendar at a fixed week. The displayed "date" doesn't matter
// to the user — only the day-of-week and time range matter.
// firstDay=1 (Mon), so the week renders Mon 1 Jan → Sun 7 Jan.
const TEMPLATE_START = "2024-01-01"; // Monday

// JS getDay() → template date string
const DAY_TO_DATE: Record<number, string> = {
  1: "2024-01-01",
  2: "2024-01-02",
  3: "2024-01-03",
  4: "2024-01-04",
  5: "2024-01-05",
  6: "2024-01-06",
  0: "2024-01-07",
};

// Reverse lookup
const DATE_TO_DAY = Object.fromEntries(
  Object.entries(DAY_TO_DATE).map(([day, date]) => [date, Number(day)])
) as Record<string, number>;

// ── Conversion helpers ────────────────────────────────────────────────────────

function localHHmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function localYYYYMMDD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** WeeklySlots → FullCalendar EventInput[] on the template week */
function slotsToEvents(slots: WeeklySlots): EventInput[] {
  const events: EventInput[] = [];
  for (const [dayStr, daySlots] of Object.entries(slots)) {
    const day = Number(dayStr);
    const date = DAY_TO_DATE[day];
    if (!date) continue;
    for (const slot of daySlots ?? []) {
      events.push({
        id: `${day}-${slot.start}`,
        start: `${date}T${slot.start}:00`,
        end:   `${date}T${slot.end}:00`,
      });
    }
  }
  return events;
}

/** FullCalendar EventInput[] → WeeklySlots */
function eventsToSlots(events: EventInput[]): Record<string, Array<{ start: string; end: string }>> {
  const slots: Record<string, Array<{ start: string; end: string }>> = {};
  for (const ev of events) {
    if (!ev.start || !ev.end) continue;
    // We always store events as ISO strings — see handleSelect / handleEventChange
    if (typeof ev.start !== "string" || typeof ev.end !== "string") continue;
    const dateStr   = ev.start.slice(0, 10);
    const startTime = ev.start.slice(11, 16);
    const endTime   = ev.end.slice(11, 16);
    const day = DATE_TO_DAY[dateStr];
    if (day === undefined) continue;
    const key = String(day);
    if (!slots[key]) slots[key] = [];
    slots[key]!.push({ start: startTime, end: endTime });
  }
  return slots;
}

// ── Timezone list ─────────────────────────────────────────────────────────────
const ALL_TIMEZONES: string[] = (() => {
  try { return Intl.supportedValuesOf("timeZone"); }
  catch { return ["UTC", "Europe/London", "America/New_York", "America/Los_Angeles"]; }
})();

// ── Component ─────────────────────────────────────────────────────────────────

export function WeeklyScheduleEditor() {
  const utils = api.useUtils();
  const { data: schedule, error: scheduleError } = api.availability.getSchedule.useQuery();

  const [timezone, setTimezone] = useState<string>(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
  });
  const [events, setEvents] = useState<EventInput[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const calRef = useRef<FullCalendar>(null);

  // Populate from saved schedule
  useEffect(() => {
    if (schedule) {
      setTimezone(schedule.timezone);
      setEvents(slotsToEvents(schedule.slots as WeeklySlots));
      setIsDirty(false);
    }
  }, [schedule]);

  // Drag-to-create
  const handleSelect = useCallback((info: DateSelectArg) => {
    const dateStr   = localYYYYMMDD(info.start);
    const startTime = localHHmm(info.start);
    const endTime   = localHHmm(info.end);
    setEvents(prev => [
      ...prev,
      { id: `slot-${Date.now()}`, start: `${dateStr}T${startTime}:00`, end: `${dateStr}T${endTime}:00` },
    ]);
    setIsDirty(true);
    info.view.calendar.unselect();
  }, []);

  // Click to delete
  const handleEventClick = useCallback((info: EventClickArg) => {
    setEvents(prev => prev.filter(e => e.id !== info.event.id));
    setIsDirty(true);
  }, []);

  // Resize or drag-to-move
  const handleEventChange = useCallback((info: EventChangeArg) => {
    if (!info.event.start || !info.event.end) return;
    const dateStr   = localYYYYMMDD(info.event.start);
    const startTime = localHHmm(info.event.start);
    const endTime   = localHHmm(info.event.end);
    setEvents(prev => prev.map(e =>
      e.id !== info.event.id ? e : { ...e, start: `${dateStr}T${startTime}:00`, end: `${dateStr}T${endTime}:00` }
    ));
    setIsDirty(true);
  }, []);

  const upsert = api.availability.upsertSchedule.useMutation({
    onSuccess: () => {
      setIsDirty(false);
      void utils.availability.getSchedule.invalidate();
      void utils.availability.computed.invalidate();
      toast.success("Schedule saved");
    },
    onError: (e) => toast.error(`Save failed: ${e.message}`),
  });

  function handleSave() {
    upsert.mutate({ timezone, slots: eventsToSlots(events) });
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
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setEvents([]); setIsDirty(true); }}
            disabled={events.length === 0 && !isDirty}
          >
            Clear all
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isDirty || upsert.isPending}>
            {upsert.isPending ? "Saving…" : "Save schedule"}
          </Button>
        </div>
      </div>

      {scheduleError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {scheduleError.message}
        </p>
      )}

      <div className="fc-wrapper rounded-lg border overflow-hidden">
        <FullCalendar
          ref={calRef}
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          initialDate={TEMPLATE_START}
          // No navigation — this is a template, not a real calendar
          headerToolbar={false}
          // Show day names only, no dates
          dayHeaderContent={({ date }) =>
            ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()] ?? ""
          }
          firstDay={1}
          // Restrict interaction to template week only
          validRange={{ start: "2024-01-01", end: "2024-01-08" }}
          // Full 24 h, scrolled to evening
          slotMinTime="00:00:00"
          slotMaxTime="24:00:00"
          scrollTime="19:00:00"
          slotDuration="00:30:00"
          snapDuration="00:30:00"
          allDaySlot={false}
          nowIndicator={false}
          // Interactions
          selectable={true}
          selectMirror={true}
          editable={true}
          selectOverlap={false}
          eventOverlap={false}
          // Data
          events={events}
          select={handleSelect}
          eventClick={handleEventClick}
          eventChange={handleEventChange}
          // Appearance
          height={520}
          eventColor="#22c55e"
          eventBorderColor="#16a34a"
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Drag to add free time. Drag edges to resize. Drag a block to move it. Click to remove.
        Repeats every week — use the Calendar tab to adjust individual dates.
      </p>
    </div>
  );
}
