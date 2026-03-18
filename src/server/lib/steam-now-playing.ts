/**
 * On-demand Steam "Now Playing" lookup with Redis caching.
 *
 * Flow:
 *   1. Check Redis for a cached result (TTL 60 s). Return immediately on hit.
 *      Redis errors are caught and logged — a Redis outage degrades gracefully
 *      to uncached behaviour, not a crash.
 *   2. On miss: call Steam GetPlayerSummaries for this one Steam ID.
 *   3. Cache only successful responses (non-error). Error responses are not
 *      stored so a transient Steam failure doesn't poison the cache.
 *   4. Write to DB only when currentGameId/currentGameName actually changed,
 *      and only on success (avoids persisting error-state nulls).
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

  // 1. Cache hit — Redis errors are non-fatal; fall through to Steam on failure
  try {
    const cached = await redis.get(cacheKey(steamId));
    if (cached !== null) {
      return JSON.parse(cached) as NowPlayingResult;
    }
  } catch (err) {
    log.warn("Redis get failed — falling through to Steam API", { err: String(err), steamId });
  }

  // 2. Fetch from Steam
  let result: NowPlayingResult | null = null; // null = fetch failed, do not cache/persist
  try {
    const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
    url.searchParams.set("key", env.STEAM_API_KEY);
    url.searchParams.set("steamids", steamId);

    const res = await fetch(url);
    if (!res.ok) {
      log.warn("GetPlayerSummaries failed", { status: res.status, steamId });
    } else {
      const json = (await res.json()) as SteamGetPlayerSummariesResponse;
      const summary = json.response?.players?.[0];
      const inGame = summary?.gameid && summary.gameid !== "0";
      if (inGame && summary) {
        const { gameid, gameextrainfo } = summary;
        result = {
          currentGameId: gameid ?? null,
          currentGameName: gameextrainfo ?? gameid ?? null,
        };
      } else {
        result = { currentGameId: null, currentGameName: null };
      }
    }
  } catch (err) {
    log.warn("GetPlayerSummaries fetch error", { err: String(err), steamId });
  }

  // 3 & 4. Only cache and persist on a successful fetch
  if (result !== null) {
    // Write to Redis — non-fatal if it fails
    try {
      await redis.set(cacheKey(steamId), JSON.stringify(result), "EX", CACHE_TTL_SECONDS);
    } catch (err) {
      log.warn("Redis set failed", { err: String(err), steamId });
    }

    // Write to DB only if value changed
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

  // Steam fetch failed — return stale DB value rather than null to avoid
  // flickering away a previously-known game name
  const stale = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { currentGameId: true, currentGameName: true },
  });
  return {
    currentGameId: stale?.currentGameId ?? null,
    currentGameName: stale?.currentGameName ?? null,
  };
}
