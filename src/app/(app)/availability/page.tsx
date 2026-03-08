"use client";

import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// FullCalendar accesses browser APIs on import — both components need ssr: false.
// The skeleton div matches the calendar height so there's no layout shift.
const CalendarSkeleton = () => (
  <div className="rounded-lg border bg-muted/10 animate-pulse" style={{ height: "560px" }} />
);

const WeeklyScheduleEditor = dynamic(
  () => import("@/components/availability/weekly-schedule-editor").then((m) => m.WeeklyScheduleEditor),
  { ssr: false, loading: CalendarSkeleton }
);

const AvailabilityCalendar = dynamic(
  () => import("@/components/availability/availability-calendar").then((m) => m.AvailabilityCalendar),
  { ssr: false, loading: CalendarSkeleton }
);

export default function AvailabilityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Availability</h1>
        <p className="text-sm text-muted-foreground">
          Set your recurring free hours, then view and tweak them on the calendar.
        </p>
      </div>

      <Tabs defaultValue="schedule" className="w-full">
        <TabsList>
          <TabsTrigger value="schedule">Weekly Schedule</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-4">
          <WeeklyScheduleEditor />
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <AvailabilityCalendar />
        </TabsContent>
      </Tabs>
    </div>
  );
}
