import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const friendshipStatusEnum = pgEnum("friendship_status", [
  "pending",
  "accepted",
  "blocked",
]);

export const friendships = pgTable(
  "friendships",
  {
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    addresseeId: text("addressee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: friendshipStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.requesterId, t.addresseeId] }),
    // Covers reverse-direction lookups (addressee → requester) with status filter.
    // Used by getUserSchedule and any query that ORs both directions.
    index("friendships_addressee_requester_status_idx").on(t.addresseeId, t.requesterId, t.status),
    // Covers "list sent requests by status" queries (e.g. pending outgoing).
    index("friendships_requester_status_idx").on(t.requesterId, t.status),
    // Covers "list received requests by status" queries (e.g. pending incoming).
    index("friendships_addressee_status_idx").on(t.addresseeId, t.status),
  ]
);
