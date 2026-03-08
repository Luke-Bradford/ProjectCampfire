import { pgEnum, pgTable, text, timestamp, jsonb, date, unique } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const overrideTypeEnum = pgEnum("override_type", ["available", "busy"]);

/** A time range, optionally spanning midnight into the next day */
export type TimeSlot = {
  start: string;            // HH:mm
  end: string;              // HH:mm (on the day indicated by endDayOffset)
  endDayOffset?: number;    // 0 = same day (default), 1 = next day (overnight)
  type?: "available" | "busy"; // defaults to "available"
  label?: string;
};

/** Weekly template: keys are day-of-week (0=Sun ... 6=Sat), values are arrays of time slots */
export type WeeklySlots = Partial<Record<number, TimeSlot[]>>;

export const availabilitySchedules = pgTable("availability_schedules", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(),
  timezone: text("timezone").notNull().default("UTC"),
  slots: jsonb("slots").$type<WeeklySlots>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const availabilityOverrides = pgTable(
  "availability_overrides",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    type: overrideTypeEnum("type").notNull().default("available"),
    slots: jsonb("slots").$type<TimeSlot[]>().notNull().default([]),
    label: text("label"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.date)]
);
