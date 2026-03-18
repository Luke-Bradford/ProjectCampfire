/**
 * On-demand Steam "Now Playing" lookup with Redis caching.
 *
 * Flow:
 *   1. Check Redis for a cached result (TTL 60 s). Return immediately on hit.
 *   2. On miss: call Steam GetPlayerSummaries for this one Steam ID.
 *   3. Store result in Redis with 60 s TTL.
 *   4. Write to DB only when currentGameId/currentGameName actually changed
 *      (avoids unnecessary Postgres writes on every cache miss while someone
 *      is playing the same game).
 *
 * This replaces the old 5-minute repeatable BullMQ job. Status is as fresh as
 * the most recent page load/query for that user, not as a background timer.
 */

import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { redis } from "@/server/redis";
import { env } from "@/env";
import { logger } from "@/lib/logger";

const log = logger.child("steam-now-playing");

/** Cache TTL in seconds — Steam API rate limit buffer */
const CACHE_TTL_SECONDS = 60;

type NowPlayingResult = {
  currentGameId: string | null;
  currentGameName: string | null;
};

type SteamPlayerSummary = {
  steamid: string;
  gameid?: string;
  gameextrainfo?: string;
};

type SteamGetPlayerSummariesResponse = {
  response?: {
    players?: SteamPlayerSummary[];
  };
};

function cacheKey(steamId: string): string {
  return `now-playing:${steamId}`;
}

/**
 * Fetch the current Steam "Now Playing" status for a user.
 *
 * @param userId  Internal user ID (for DB write-on-change)
 * @param steamId Steam ID 64 for the user
 * @returns Current game info, or nulls if not in a game / Steam unavailable
 */
export async function getNowPlaying(
  userId: string,
  steamId: string,
): Promise<NowPlayingResult> {
  if (!env.STEAM_API_KEY) {
    return { currentGameId: null, currentGameName: null };
  }

  // 1. Cache hit
  const cached = await redis.get(cacheKey(steamId));
  if (cached !== null) {
    return JSON.parse(cached) as NowPlayingResult;
  }

  // 2. Fetch from Steam
  let result: NowPlayingResult;
  try {
    const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
    url.searchParams.set("key", env.STEAM_API_KEY);
    url.searchParams.set("steamids", steamId);

    const res = await fetch(url);
    if (!res.ok) {
      log.warn("GetPlayerSummaries failed", { status: res.status, steamId });
      result = { currentGameId: null, currentGameName: null };
    } else {
      const json = (await res.json()) as SteamGetPlayerSummariesResponse;
      const summary = json.response?.players?.[0];
      const inGame = summary?.gameid && summary.gameid !== "0";
      result = inGame
        ? {
            currentGameId: summary!.gameid!,
            currentGameName: summary!.gameextrainfo ?? summary!.gameid ?? null,
          }
        : { currentGameId: null, currentGameName: null };
    }
  } catch (err) {
    log.warn("GetPlayerSummaries fetch error", { err: String(err), steamId });
    result = { currentGameId: null, currentGameName: null };
  }

  // 3. Write to Redis cache
  await redis.set(cacheKey(steamId), JSON.stringify(result), "EX", CACHE_TTL_SECONDS);

  // 4. Write to DB only if value changed (avoids hot-path Postgres writes)
  const current = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { currentGameId: true, currentGameName: true },
  });

  if (
    current &&
    (current.currentGameId !== result.currentGameId ||
      current.currentGameName !== result.currentGameName)
  ) {
    await db
      .update(user)
      .set({ currentGameId: result.currentGameId, currentGameName: result.currentGameName })
      .where(eq(user.id, userId));
  }

  return result;
}
