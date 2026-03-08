import { addDays, format, parseISO } from "date-fns";
import { TZDate } from "@date-fns/tz";
import type { TimeSlot, WeeklySlots } from "@/server/db/schema/availability";

export type ComputedSlot = {
  date: string; // YYYY-MM-DD
  start: string; // ISO datetime
  end: string; // ISO datetime
  source: "schedule" | "override";
  type: "available" | "busy";
  label?: string;
};

/**
 * Expand a weekly schedule + overrides into concrete time slots for a date range.
 *
 * For each date in [from, to]:
 *   - If an override exists for that date, use its slots (empty = unavailable all day)
 *   - Otherwise, use the schedule slots for that day of week
 *   - Convert HH:mm local times to absolute ISO timestamps using the schedule timezone
 */
export function expandAvailability(
  schedule: { slots: WeeklySlots; timezone: string } | null,
  overrides: Array<{ date: string; slots: TimeSlot[]; type?: string | null; label?: string | null }>,
  from: string,
  to: string
): ComputedSlot[] {
  const result: ComputedSlot[] = [];
  const overrideMap = new Map(overrides.map((o) => [o.date, o]));

  let current = parseISO(from);
  const end = parseISO(to);

  while (current <= end) {
    const dateStr = format(current, "yyyy-MM-dd");
    const override = overrideMap.get(dateStr);

    if (override) {
      const overrideType = override.type === "busy" ? "busy" : "available";
      // For a "busy" override we still record it so the calendar can show the block
      // even with empty slots (meaning busy all day — no available times)
      if (overrideType === "busy" && override.slots.length === 0) {
        // Represent a full-day busy block with a single synthetic all-day marker
        result.push({
          date: dateStr,
          start: `${dateStr}T00:00:00.000Z`,
          end: `${dateStr}T23:59:59.000Z`,
          source: "override",
          type: "busy",
          label: override.label ?? undefined,
        });
      } else {
        for (const slot of override.slots) {
          const tz = schedule?.timezone ?? "UTC";
          const { start, end: slotEnd } = slotToISO(dateStr, slot, tz);
          result.push({
            date: dateStr,
            start,
            end: slotEnd,
            source: "override",
            type: overrideType,
            label: override.label ?? undefined,
          });
        }
      }
    } else if (schedule) {
      const dow = current.getDay();
      const daySlots = schedule.slots[dow] ?? [];
      for (const slot of daySlots) {
        const { start, end: slotEnd } = slotToISO(dateStr, slot, schedule.timezone);
        result.push({
          date: dateStr,
          start,
          end: slotEnd,
          source: "schedule",
          type: "available",
        });
      }
    }

    current = addDays(current, 1);
  }

  return result;
}

/**
 * Convert a HH:mm time slot on a specific date + timezone to ISO strings.
 */
function slotToISO(
  dateStr: string,
  slot: TimeSlot,
  timezone: string
): { start: string; end: string } {
  const [sh, sm] = slot.start.split(":").map(Number);
  const [eh, em] = slot.end.split(":").map(Number);

  const startDate = new TZDate(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(5, 7)) - 1,
    Number(dateStr.slice(8, 10)),
    sh,
    sm,
    0,
    timezone
  );

  const endDate = new TZDate(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(5, 7)) - 1,
    Number(dateStr.slice(8, 10)),
    eh,
    em,
    0,
    timezone
  );

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

/**
 * Validate that a TimeSlot has valid HH:mm format and end > start.
 */
export function isValidTimeSlot(slot: TimeSlot): boolean {
  const pattern = /^\d{2}:\d{2}$/;
  if (!pattern.test(slot.start) || !pattern.test(slot.end)) return false;
  const [sh, sm] = slot.start.split(":").map(Number);
  const [eh, em] = slot.end.split(":").map(Number);
  if (sh > 23 || sm > 59 || eh > 23 || em > 59) return false;
  return sh * 60 + sm < eh * 60 + em;
}

/**
 * Check that no slots overlap within a day.
 */
export function hasNoOverlaps(slots: TimeSlot[]): boolean {
  const sorted = [...slots].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) return false;
  }
  return true;
}

/**
 * Convert a grid selection (set of half-hour cell indices) to merged time slots.
 * Each cell index maps to a 30-minute block: index 0 = 00:00-00:30, index 1 = 00:30-01:00, etc.
 */
export function cellsToSlots(cells: Set<number>): TimeSlot[] {
  const sorted = [...cells].sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const slots: TimeSlot[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      slots.push({
        start: cellToTime(start),
        end: cellToTime(prev + 1),
      });
      start = sorted[i];
      prev = sorted[i];
    }
  }
  slots.push({
    start: cellToTime(start),
    end: cellToTime(prev + 1),
  });

  return slots;
}

/**
 * Convert time slots back to a set of half-hour cell indices.
 */
export function slotsToCell(slots: TimeSlot[]): Set<number> {
  const cells = new Set<number>();
  for (const slot of slots) {
    const startIdx = timeToCell(slot.start);
    const endIdx = timeToCell(slot.end);
    for (let i = startIdx; i < endIdx; i++) {
      cells.add(i);
    }
  }
  return cells;
}

function cellToTime(cell: number): string {
  const h = Math.floor(cell / 2);
  const m = (cell % 2) * 30;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToCell(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 2 + Math.floor(m / 30);
}
