import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const gameSourceEnum = pgEnum("game_source", ["manual", "igdb", "steam_app"]);

export const gamePlatformEnum = pgEnum("game_platform", [
  "pc",
  "playstation",
  "xbox",
  "nintendo",
  "other",
]);

export const ownershipSourceEnum = pgEnum("ownership_source", ["manual", "steam"]);

export const games = pgTable("games", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  coverUrl: text("cover_url"),
  description: text("description"),
  minPlayers: integer("min_players"),
  maxPlayers: integer("max_players"),
  genres: text("genres").array().notNull().default([]),
  externalSource: gameSourceEnum("external_source").notNull().default("manual"),
  externalId: text("external_id"),
  steamAppId: text("steam_app_id"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const gameOwnerships = pgTable(
  "game_ownerships",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    platform: gamePlatformEnum("platform").notNull(),
    source: ownershipSourceEnum("source").notNull().default("manual"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.gameId, t.platform] }),
  })
);
