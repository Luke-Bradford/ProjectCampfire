"use client";

import Link from "next/link";
import { Calendar, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WeeklySlots } from "@/server/db/schema/availability";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function formatTime(hhmm: string): string {
  const parts = hhmm.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  const period = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${period}` : `${hour}:${String(m).padStart(2, "0")}${period}`;
}

interface AvailabilitySummaryProps {
  slots: WeeklySlots;
  isOwn?: boolean;
}

export function AvailabilitySummary({ slots, isOwn }: AvailabilitySummaryProps) {
  const days = Object.keys(slots)
    .map(Number)
    .filter((d) => (slots[d]?.length ?? 0) > 0)
    .sort((a, b) => a - b);

  if (days.length === 0) {
    return (
      <div className="rounded-xl border bg-card shadow-sm p-6 flex flex-col items-center gap-3 text-center">
        <Calendar size={32} className="text-muted-foreground" />
        <div>
          <p className="font-semibold">No recurring schedule set</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isOwn
              ? "Set your recurring free hours so friends know when you're around."
              : "This user hasn't set a recurring schedule yet."}
          </p>
        </div>
        {isOwn && (
          <Button asChild size="sm">
            <Link href="/availability">Set schedule</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Weekly schedule</p>
        {isOwn && (
          <Button asChild variant="ghost" size="sm" className="text-xs h-7 px-2 gap-1">
            <Link href="/availability">
              Edit
              <ChevronRight size={12} />
            </Link>
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {days.map((dow) => {
          const daySlots = slots[dow] ?? [];
          const availableSlots = daySlots.filter((s) => (s.type ?? "available") === "available");
          if (availableSlots.length === 0) return null;

          return (
            <div key={dow} className="flex items-start gap-3">
              <span className="text-xs font-medium text-muted-foreground w-7 shrink-0 pt-0.5">
                {DAY_LABELS[dow]}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {availableSlots.map((slot, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 font-medium"
                  >
                    {formatTime(slot.start)}–{formatTime(slot.end)}
                    {slot.label ? ` · ${slot.label}` : ""}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
