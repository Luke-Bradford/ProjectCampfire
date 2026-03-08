"use client";

import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeeklyScheduleEditor } from "@/components/availability/weekly-schedule-editor";

// FullCalendar doesn't support SSR — dynamically import with ssr: false
const AvailabilityCalendar = dynamic(
  () =>
    import("@/components/availability/availability-calendar").then(
      (m) => m.AvailabilityCalendar
    ),
  { ssr: false, loading: () => <div className="py-8 text-center text-muted-foreground">Loading calendar...</div> }
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
