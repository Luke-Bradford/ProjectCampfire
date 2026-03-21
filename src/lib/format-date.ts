import { format, isToday, isTomorrow } from "date-fns";

/**
 * Format an event date for display in lists and cards.
 *
 * Returns a human-friendly label:
 *   - "Today, 21:30"
 *   - "Tomorrow, 21:30"
 *   - "Fri 18 Apr, 21:30"
 *
 * Uses 24-hour time throughout for consistency with the rest of the app.
 * Pass `includeTime: false` to omit the time portion (e.g. for date-only displays).
 */
export function formatEventDate(date: Date, { includeTime = true }: { includeTime?: boolean } = {}): string {
  const timeSuffix = includeTime ? `, ${format(date, "HH:mm")}` : "";
  if (isToday(date))    return `Today${timeSuffix}`;
  if (isTomorrow(date)) return `Tomorrow${timeSuffix}`;
  return format(date, "EEE d MMM") + timeSuffix;
}
