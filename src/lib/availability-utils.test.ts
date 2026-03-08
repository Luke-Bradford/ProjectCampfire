import { describe, it, expect } from "vitest";
import {
  expandAvailability,
  isValidTimeSlot,
  hasNoOverlaps,
  cellsToSlots,
  slotsToCell,
} from "./availability-utils";

describe("isValidTimeSlot", () => {
  it("accepts valid slot", () => {
    expect(isValidTimeSlot({ start: "09:00", end: "17:00" })).toBe(true);
  });

  it("rejects end before start", () => {
    expect(isValidTimeSlot({ start: "17:00", end: "09:00" })).toBe(false);
  });

  it("rejects equal start and end", () => {
    expect(isValidTimeSlot({ start: "09:00", end: "09:00" })).toBe(false);
  });

  it("rejects invalid format", () => {
    expect(isValidTimeSlot({ start: "9:00", end: "17:00" })).toBe(false);
    expect(isValidTimeSlot({ start: "09:00", end: "25:00" })).toBe(false);
  });
});

describe("hasNoOverlaps", () => {
  it("returns true for non-overlapping slots", () => {
    expect(
      hasNoOverlaps([
        { start: "09:00", end: "12:00" },
        { start: "14:00", end: "17:00" },
      ])
    ).toBe(true);
  });

  it("returns false for overlapping slots", () => {
    expect(
      hasNoOverlaps([
        { start: "09:00", end: "14:00" },
        { start: "12:00", end: "17:00" },
      ])
    ).toBe(false);
  });

  it("returns true for empty array", () => {
    expect(hasNoOverlaps([])).toBe(true);
  });

  it("returns true for adjacent slots", () => {
    expect(
      hasNoOverlaps([
        { start: "09:00", end: "12:00" },
        { start: "12:00", end: "17:00" },
      ])
    ).toBe(true);
  });
});

describe("cellsToSlots / slotsToCell", () => {
  it("converts consecutive cells to a single slot", () => {
    const cells = new Set([14, 15, 16, 17]); // 07:00-09:00
    const slots = cellsToSlots(cells);
    expect(slots).toEqual([{ start: "07:00", end: "09:00" }]);
  });

  it("converts non-consecutive cells to multiple slots", () => {
    const cells = new Set([14, 15, 20, 21]); // 07:00-08:00 and 10:00-11:00
    const slots = cellsToSlots(cells);
    expect(slots).toEqual([
      { start: "07:00", end: "08:00" },
      { start: "10:00", end: "11:00" },
    ]);
  });

  it("round-trips cells through slots and back", () => {
    const original = new Set([14, 15, 16, 20, 21, 22]);
    const slots = cellsToSlots(original);
    const result = slotsToCell(slots);
    expect(result).toEqual(original);
  });

  it("handles empty set", () => {
    expect(cellsToSlots(new Set())).toEqual([]);
  });
});

describe("expandAvailability", () => {
  it("expands schedule for a single day", () => {
    // 2026-03-09 is a Monday (JS getDay() = 1)
    const schedule = {
      timezone: "UTC",
      slots: { 1: [{ start: "19:00", end: "23:00" }] },
    };

    const result = expandAvailability(schedule, [], "2026-03-09", "2026-03-09");
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("schedule");
    expect(result[0].date).toBe("2026-03-09");
  });

  it("returns empty for days with no schedule", () => {
    const schedule = {
      timezone: "UTC",
      slots: { 1: [{ start: "19:00", end: "23:00" }] }, // Monday only
    };

    // 2026-03-10 is Tuesday
    const result = expandAvailability(schedule, [], "2026-03-10", "2026-03-10");
    expect(result).toHaveLength(0);
  });

  it("overrides replace schedule slots", () => {
    const schedule = {
      timezone: "UTC",
      slots: { 1: [{ start: "19:00", end: "23:00" }] },
    };
    const overrides = [
      { date: "2026-03-09", slots: [{ start: "14:00", end: "18:00" }], label: "Extra time" },
    ];

    const result = expandAvailability(schedule, overrides, "2026-03-09", "2026-03-09");
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("override");
    expect(result[0].label).toBe("Extra time");
  });

  it("empty override slots mean unavailable all day", () => {
    const schedule = {
      timezone: "UTC",
      slots: { 1: [{ start: "19:00", end: "23:00" }] },
    };
    const overrides = [{ date: "2026-03-09", slots: [] }];

    const result = expandAvailability(schedule, overrides, "2026-03-09", "2026-03-09");
    expect(result).toHaveLength(0);
  });

  it("returns empty when no schedule exists", () => {
    const result = expandAvailability(null, [], "2026-03-09", "2026-03-15");
    expect(result).toHaveLength(0);
  });

  it("expands across multiple days", () => {
    const schedule = {
      timezone: "UTC",
      slots: {
        1: [{ start: "19:00", end: "23:00" }], // Monday
        5: [{ start: "20:00", end: "23:30" }], // Friday
      },
    };

    // 2026-03-09 (Mon) to 2026-03-15 (Sun) = full week
    const result = expandAvailability(schedule, [], "2026-03-09", "2026-03-15");
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2026-03-09"); // Monday
    expect(result[1].date).toBe("2026-03-13"); // Friday
  });
});
