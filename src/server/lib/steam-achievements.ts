/**
 * Fetches Steam achievement counts for a specific user + game and caches
 * the result in the gameOwnerships row.
 *
 * Uses:
 *   - IPlayerService/GetPlayerAchievements/v1 — unlocked count for this user
 *   - ISteamUserStats/GetSchemaForGame/v2 — total achievement count for the game
 *
 * Returns null when:
 *   - STEAM_API_KEY is not configured
 *   - The user has no Steam account linked
 *   - The game has no Steam app ID (not a Steam game)
 *   - The user's stats are private (Steam API 403/401)
 *   - The game has no achievements
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { gameOwnerships, games, user } from "@/server/db/schema";
import { env } from "@/env";
import { logger } from "@/lib/logger";

const log = logger.child("steam-achievements");

type AchievementResult = {
  unlocked: number;
  total: number;
};

type PlayerAchievement = {
  apiname: string;
  achieved: 0 | 1;
};

type GetPlayerAchievementsResponse = {
  playerstats?: {
    success?: boolean;
    error?: string;
    achievements?: PlayerAchievement[];
  };
};

type GameSchema = {
  game?: {
    availableGameStats?: {
      achievements?: { name: string }[];
    };
  };
};

/**
 * Fetch and cache achievement counts for a user+game pair.
 * Only queries Steam if the cache is absent (null columns).
 * Returns cached values immediately if already present.
 */
export async function fetchAndCacheAchievements(
  userId: string,
  gameId: string,
): Promise<AchievementResult | null> {
  if (!env.STEAM_API_KEY) {
    log.warn("STEAM_API_KEY not configured");
    return null;
  }

  // Load user Steam data + the PC ownership row (achievements come from Steam, always PC)
  const [userRow, ownershipRow] = await Promise.all([
    db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { steamId: true, steamLibraryPublic: true },
    }),
    db.query.gameOwnerships.findFirst({
      where: and(
        eq(gameOwnerships.userId, userId),
        eq(gameOwnerships.gameId, gameId),
        eq(gameOwnerships.platform, "pc"),
      ),
      columns: { achievementsUnlocked: true, achievementsTotal: true },
    }),
  ]);

  if (!userRow?.steamId || !userRow.steamLibraryPublic) return null;

  // Return cached values if present
  if (ownershipRow?.achievementsUnlocked != null && ownershipRow?.achievementsTotal != null) {
    return { unlocked: ownershipRow.achievementsUnlocked, total: ownershipRow.achievementsTotal };
  }

  // Fetch the Steam app ID for this game
  const gameRow = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    columns: { steamAppId: true },
  });
  if (!gameRow?.steamAppId) return null;

  // Fetch achievement data from Steam in parallel
  const [playerRes, schemaRes] = await Promise.allSettled([
    fetchPlayerAchievements(userRow.steamId, gameRow.steamAppId),
    fetchGameSchema(gameRow.steamAppId),
  ]);

  const playerAchievements = playerRes.status === "fulfilled" ? playerRes.value : null;
  const schemaAchievements = schemaRes.status === "fulfilled" ? schemaRes.value : null;

  if (playerAchievements === null && schemaAchievements === null) return null;

  const unlocked = playerAchievements?.filter((a) => a.achieved === 1).length ?? 0;
  // Prefer schema count (authoritative total); fall back to player count length
  const total = schemaAchievements ?? playerAchievements?.length ?? 0;

  if (total === 0) return null; // game has no achievements

  // Cache result on all PC ownership rows for this user+game
  await db
    .update(gameOwnerships)
    .set({ achievementsUnlocked: unlocked, achievementsTotal: total })
    .where(
      and(
        eq(gameOwnerships.userId, userId),
        eq(gameOwnerships.gameId, gameId),
        eq(gameOwnerships.platform, "pc"),
      )
    );

  log.info("cached achievement counts", { userId, gameId, unlocked, total });
  return { unlocked, total };
}

async function fetchPlayerAchievements(
  steamId: string,
  appId: string,
): Promise<PlayerAchievement[] | null> {
  const url = new URL("https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/");
  url.searchParams.set("key", env.STEAM_API_KEY!);
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("appid", appId);
  url.searchParams.set("l", "english");

  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) {
    // 400/403 = private or no achievements — not an error worth throwing
    await res.text();
    log.info("GetPlayerAchievements non-ok", { status: res.status, appId });
    return null;
  }

  const json = (await res.json()) as GetPlayerAchievementsResponse;
  if (!json.playerstats?.success || !json.playerstats.achievements) return null;
  return json.playerstats.achievements;
}

async function fetchGameSchema(appId: string): Promise<number | null> {
  const url = new URL("https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/");
  url.searchParams.set("key", env.STEAM_API_KEY!);
  url.searchParams.set("appid", appId);

  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) {
    await res.text();
    log.info("GetSchemaForGame non-ok", { status: res.status, appId });
    return null;
  }

  const json = (await res.json()) as GameSchema;
  const ach = json.game?.availableGameStats?.achievements;
  return ach ? ach.length : null;
}
