"use client";

import { useState, useCallback, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg, EventClickArg, DatesSetArg, EventInput } from "@fullcalendar/core";
import { api } from "@/trpc/react";
import { format, startOfMonth, endOfMonth, addMonths } from "date-fns";
import { OverrideDialog } from "./override-dialog";
import type { TimeSlot } from "@/server/db/schema/availability";

type OverrideType = "available" | "busy";

export function AvailabilityCalendar() {
  const [dateRange, setDateRange] = useState(() => ({
    from: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    to: format(endOfMonth(addMonths(new Date(), 2)), "yyyy-MM-dd"),
  }));

  const { data: computed = [] } = api.availability.computed.useQuery(dateRange);
  const { data: overrides = [] } = api.availability.listOverrides.useQuery(dateRange);
  const utils = api.useUtils();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState("");
  const [dialogSlots, setDialogSlots] = useState<TimeSlot[] | undefined>(undefined);
  const [dialogType, setDialogType] = useState<OverrideType | undefined>(undefined);
  const [dialogLabel, setDialogLabel] = useState<string | undefined>(undefined);
  const calendarRef = useRef<FullCalendar>(null);

  const events: EventInput[] = computed.map((slot, i) => {
    const isBusy = slot.type === "busy";
    const isOverride = slot.source === "override";
    let bg = "#22c55e"; // schedule available: green
    let border = "#16a34a";
    if (isOverride && !isBusy) { bg = "#f59e0b"; border = "#d97706"; } // override available: amber
    if (isBusy) { bg = "#ef4444"; border = "#dc2626"; }               // busy: red

    return {
      id: `${slot.source}-${slot.date}-${i}`,
      start: slot.start,
      end: slot.end,
      title: slot.label || (isBusy ? "Busy" : isOverride ? "Override" : "Available"),
      backgroundColor: bg,
      borderColor: border,
      display: "block",
      extendedProps: { source: slot.source, type: slot.type, date: slot.date },
    };
  });

  const openDialog = useCallback(
    (dateStr: string, prefillSlots?: TimeSlot[]) => {
      const existing = overrides.find((o) => o.date === dateStr);
      if (existing) {
        setDialogSlots(existing.slots as TimeSlot[]);
        setDialogType((existing.type as OverrideType) ?? "available");
        setDialogLabel(existing.label ?? undefined);
      } else {
        setDialogSlots(prefillSlots);
        setDialogType(undefined);
        setDialogLabel(undefined);
      }
      setDialogDate(dateStr);
      setDialogOpen(true);
    },
    [overrides]
  );

  const handleDateSelect = useCallback(
    (info: DateSelectArg) => {
      const dateStr = format(info.start, "yyyy-MM-dd");
      const startTime = format(info.start, "HH:mm");
      const endTime = format(info.end, "HH:mm");
      const prefill =
        startTime !== "00:00" || endTime !== "00:00"
          ? [{ start: startTime, end: endTime }]
          : undefined;
      openDialog(dateStr, prefill);
    },
    [openDialog]
  );

  const handleEventClick = useCallback(
    (info: EventClickArg) => {
      openDialog(info.event.extendedProps.date as string);
    },
    [openDialog]
  );

  const handleDatesSet = useCallback((info: DatesSetArg) => {
    setDateRange({
      from: format(info.start, "yyyy-MM-dd"),
      to: format(info.end, "yyyy-MM-dd"),
    });
  }, []);

  const handleSaved = useCallback(() => {
    void utils.availability.computed.invalidate();
    void utils.availability.listOverrides.invalidate();
  }, [utils]);

  return (
    <>
      <div className="fc-wrapper rounded-lg border p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          firstDay={1}
          slotMinTime="00:00:00"
          slotMaxTime="24:00:00"
          scrollTime="19:00:00"
          slotDuration="00:30:00"
          allDaySlot={false}
          selectable={true}
          selectMirror={true}
          select={handleDateSelect}
          eventClick={handleEventClick}
          events={events}
          datesSet={handleDatesSet}
          height="auto"
          weekNumbers={false}
          nowIndicator={true}
          eventTimeFormat={{
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }}
        />
      </div>

      {dialogOpen && (
        <OverrideDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          date={dialogDate}
          existingSlots={dialogSlots}
          existingType={dialogType}
          existingLabel={dialogLabel}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
