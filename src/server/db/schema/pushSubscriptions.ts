import { pgTable, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Stores Web Push API subscription objects for browser push notifications.
 * One user can have multiple subscriptions (multiple devices/browsers).
 * The (userId, endpoint) pair is unique — re-subscribing the same browser
 * upserts rather than duplicates.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: varchar("auth", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqUserEndpoint: unique().on(t.userId, t.endpoint),
  })
);
