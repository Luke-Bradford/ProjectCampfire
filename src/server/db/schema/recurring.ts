import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { groups } from "./groups";

/**
 * A recurring session template attached to a group.
 *
 * The template defines a weekly schedule (day-of-week + start/end time in a
 * named timezone) and controls how far ahead generated events appear.
 *
 * The BullMQ `recurring-event-generator` job runs daily and creates an event
 * for each active template whose next occurrence falls within `leadDays` and
 * hasn't already been generated.
 */
export const recurringTemplates = pgTable("recurring_templates", {
  id: text("id").primaryKey(),
  groupId: text("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  /** 0 = Sunday … 6 = Saturday (JS Date.getDay() convention) */
  dayOfWeek: integer("day_of_week").notNull(),
  /** Local wall-clock start time as "HH:MM" (24-hour) */
  startTime: varchar("start_time", { length: 5 }).notNull(),
  /** Local wall-clock end time as "HH:MM" (24-hour), may exceed "23:59" for overnight */
  endTime: varchar("end_time", { length: 5 }).notNull(),
  /** IANA timezone string, e.g. "Europe/London" */
  timezone: varchar("timezone", { length: 64 }).notNull(),
  /** How many days before the session to auto-generate the event */
  leadDays: integer("lead_days").notNull().default(7),
  /** Whether to automatically add a game poll when the event is generated */
  autoPoll: boolean("auto_poll").notNull().default(false),
  /** Status for generated events: "draft" or "open" */
  generatedEventStatus: varchar("generated_event_status", { length: 10 })
    .notNull()
    .default("draft"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
