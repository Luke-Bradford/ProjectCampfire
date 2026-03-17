import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { groups } from "./groups";
import { games } from "./games";
import { recurringTemplates } from "./recurring";

export const eventStatusEnum = pgEnum("event_status", [
  "draft",
  "open",
  "confirmed",
  "cancelled",
]);

export const rsvpStatusEnum = pgEnum("rsvp_status", ["yes", "no", "maybe"]);

export const pollTypeEnum = pgEnum("poll_type", [
  "time_slot",
  "game",
  "duration",
  "custom",
]);

export const pollStatusEnum = pgEnum("poll_status", ["open", "closed"]);

// ── Event ─────────────────────────────────────────────────────────────────────

export const events = pgTable("events", {
  id: text("id").primaryKey(),
  groupId: text("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  status: eventStatusEnum("status").notNull().default("draft"),
  gameId: text("game_id").references(() => games.id, { onDelete: "set null" }),
  gameOptional: boolean("game_optional").notNull().default(false),
  location: text("location"),
  confirmedStartsAt: timestamp("confirmed_starts_at"),
  confirmedEndsAt: timestamp("confirmed_ends_at"),
  /** Set when this event was auto-generated from a recurring template */
  recurringTemplateId: text("recurring_template_id").references(
    () => recurringTemplates.id,
    { onDelete: "set null" }
  ),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── RSVP ──────────────────────────────────────────────────────────────────────

export const eventRsvps = pgTable(
  "event_rsvps",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: rsvpStatusEnum("status").notNull(),
    note: text("note"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.eventId, t.userId] }),
  })
);

// ── Poll ──────────────────────────────────────────────────────────────────────

export const polls = pgTable("polls", {
  id: text("id").primaryKey(),
  eventId: text("event_id").references(() => events.id, { onDelete: "cascade" }),
  groupId: text("group_id").references(() => groups.id, { onDelete: "cascade" }),
  type: pollTypeEnum("type").notNull(),
  question: text("question").notNull(),
  allowMultipleVotes: text("allow_multiple_votes").notNull().default("false"),
  closesAt: timestamp("closes_at"),
  status: pollStatusEnum("status").notNull().default("open"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Poll option ───────────────────────────────────────────────────────────────

export const pollOptions = pgTable("poll_options", {
  id: text("id").primaryKey(),
  pollId: text("poll_id")
    .notNull()
    .references(() => polls.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  gameId: text("game_id").references(() => games.id, { onDelete: "set null" }),
  startsAt: timestamp("starts_at"), // for time_slot polls
  endsAt: timestamp("ends_at"),     // for time_slot polls
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── Poll vote ─────────────────────────────────────────────────────────────────

export const pollVotes = pgTable(
  "poll_votes",
  {
    pollOptionId: text("poll_option_id")
      .notNull()
      .references(() => pollOptions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.pollOptionId, t.userId] }),
  })
);
