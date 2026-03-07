import {
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const groupVisibilityEnum = pgEnum("group_visibility", [
  "standard",
  "private",
]);

export const groupRoleEnum = pgEnum("group_role", [
  "owner",
  "admin",
  "member",
]);

export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  avatarUrl: text("avatar_url"),
  visibility: groupVisibilityEnum("visibility").notNull().default("standard"),
  discordInviteUrl: text("discord_invite_url"),
  inviteToken: varchar("invite_token", { length: 64 }).unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const groupMemberships = pgTable(
  "group_memberships",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: groupRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.groupId, t.userId] }),
  })
);
