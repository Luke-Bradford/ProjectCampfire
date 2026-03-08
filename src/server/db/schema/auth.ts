import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const profileVisibilityEnum = pgEnum("profile_visibility", [
  "open",
  "private",
]);

export type NotificationPrefs = {
  // ── In-app (bell) ───────────────────────────────────────────
  friendRequestReceived?: boolean;  // default on
  friendRequestAccepted?: boolean;  // default on
  groupInviteReceived?: boolean;    // default on

  // ── Email ────────────────────────────────────────────────────
  // Friends
  emailFriendRequest?: boolean;     // default off
  // Events
  emailEventConfirmed?: boolean;    // default on
  emailEventCancelled?: boolean;    // default on
  emailEventRsvpReminder?: boolean; // default on
  // Polls
  emailPollOpened?: boolean;        // default on
  emailPollClosed?: boolean;        // default off
  // Groups
  emailGroupInvite?: boolean;       // default on
};

// better-auth user table extended with our profile fields.
// "name" = display name, "image" = avatar URL (better-auth conventions).
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  // Profile fields
  username: varchar("username", { length: 20 }).unique(),
  usernameChangedAt: timestamp("username_changed_at"),
  bio: text("bio"),
  profileVisibility: profileVisibilityEnum("profile_visibility")
    .notNull()
    .default("open"),
  notificationPrefs: jsonb("notification_prefs")
    .$type<NotificationPrefs>()
    .notNull()
    .default({}),
  inviteToken: varchar("invite_token", { length: 64 }).unique(),
  deletedAt: timestamp("deleted_at"),
});

// better-auth session table
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

// better-auth OAuth account table (Phase 2: Google, Discord)
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

// better-auth verification table (email verification, password reset tokens)
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});
