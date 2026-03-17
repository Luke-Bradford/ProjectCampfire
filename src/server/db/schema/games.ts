import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

export type SteamPriceData = {
  currency: string;
  initial: number;       // cents
  final: number;         // cents (after discount)
  discountPercent: number;
  initialFormatted: string;
  finalFormatted: string;
};

export const gameSourceEnum = pgEnum("game_source", ["manual", "igdb", "steam_app"]);

export const gamePlatformEnum = pgEnum("game_platform", [
  "pc",
  "playstation",
  "xbox",
  "nintendo",
  "other",
]);

export const ownershipSourceEnum = pgEnum("ownership_source", ["manual", "steam"]);

export const games = pgTable(
  "games",
  {
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
    // Steam Store price snapshot (snapshotted at poll creation time)
    priceDataJson: jsonb("price_data_json").$type<SteamPriceData>(),
    priceSnapshotAt: timestamp("price_snapshot_at"),
    // Last time the IGDB metadata was refreshed by the re-enrichment job (CAMP-116)
    igdbEnrichedAt: timestamp("igdb_enriched_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    // Partial unique index: only one row per (source, externalId) when externalId is not null.
    // Prevents duplicate imports of the same IGDB/Steam game even under concurrent requests.
    externalIdUniq: uniqueIndex("games_external_source_id_uniq")
      .on(t.externalSource, t.externalId)
      .where(sql`${t.externalId} is not null`),
  })
);

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
    hidden: boolean("hidden").notNull().default(false),
    // Steam playtime data — null means never launched or pre-migration row.
    playtimeMinutes: integer("playtime_minutes"),
    lastPlayedAt: timestamp("last_played_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.gameId, t.platform] }),
  })
);
