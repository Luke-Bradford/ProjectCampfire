import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { groups } from "./groups";

export const availabilityVisibilityEnum = pgEnum("availability_visibility", [
  "friends",
  "group",
  "private",
]);

export const availabilityBlocks = pgTable("availability_blocks", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  groupId: text("group_id").references(() => groups.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  label: text("label"),
  visibility: availabilityVisibilityEnum("visibility").notNull().default("friends"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
