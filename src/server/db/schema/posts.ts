import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { groups } from "./groups";
import { events } from "./events";

export const reactionTypeEnum = pgEnum("reaction_type", ["like"]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "friend_request_received",
  "friend_request_accepted",
  "group_invite_received",
  "post_comment",
  "post_like",
  "comment_like",
  "event_proposed",
  "event_confirmed",
  "event_cancelled",
]);

export type EmbedMetadata = {
  type: "youtube" | "link";
  url: string;
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  videoId?: string;
};

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  authorId: text("author_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  groupId: text("group_id").references(() => groups.id, {
    onDelete: "cascade",
  }),
  eventId: text("event_id").references(() => events.id, {
    onDelete: "cascade",
  }),
  body: varchar("body", { length: 1000 }),
  imageUrls: text("image_urls").array(),
  embedMetadata: jsonb("embed_metadata").$type<EmbedMetadata>(),
  repostOfId: text("repost_of_id"),
  pinnedAt: timestamp("pinned_at"),
  editedAt: timestamp("edited_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  postId: text("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  body: varchar("body", { length: 1000 }).notNull(),
  imageUrls: text("image_urls").array(),
  editedAt: timestamp("edited_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reactions = pgTable("reactions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  postId: text("post_id").references(() => posts.id, { onDelete: "cascade" }),
  commentId: text("comment_id").references(() => comments.id, {
    onDelete: "cascade",
  }),
  type: reactionTypeEnum("type").notNull().default("like"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  data: jsonb("data").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
