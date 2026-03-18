import type { Job } from "bullmq";
import { eq, and, inArray, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/server/db";
import { user, games, gameOwnerships } from "@/server/db/schema";
import type { RecentlyPlayedEntry } from "@/server/db/schema";
import { env } from "@/env";
import type { SteamJobPayload } from "@/server/jobs/steam-jobs";
import { snapshotSteamSpyData } from "@/server/lib/steamspy";
import { logger } from "@/lib/logger";

const log = logger.child("steam");

export async function processSteamJob(job: Job<SteamJobPayload>): Promise<void> {
  const { data } = job;

  switch (data.type) {
    case "sync_steam_library": {
      await syncSteamLibrary(data.userId);
      break;
    }
    default: {
      log.warn("unknown job type", { type: (data as { type: string }).type });
    }
  }
}

// ── Steam API types ───────────────────────────────────────────────────────────

type SteamOwnedGame = {
  appid: number;
  name?: string;
  playtime_forever?: number;
  rtime_last_played?: number; // Unix timestamp (seconds); 0 = never played
};

type SteamGetOwnedGamesResponse = {
  response?: {
    game_count?: number;
    games?: SteamOwnedGame[];
  };
};

type SteamRecentGame = {
  appid: number;
  name?: string;
  playtime_2weeks?: number;
};

type SteamGetRecentlyPlayedResponse = {
  response?: {
    total_count?: number;
    games?: SteamRecentGame[];
  };
};

// ── Sync logic ────────────────────────────────────────────────────────────────

async function syncSteamLibrary(userId: string): Promise<void> {
  if (!env.STEAM_API_KEY) {
    log.warn("STEAM_API_KEY not configured — skipping sync", { userId });
    return;
  }

  // Load the user's Steam ID
  const userRow = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { steamId: true, steamLibraryPublic: true },
  });

  if (!userRow?.steamId) {
    log.warn("user has no Steam account linked — skipping", { userId });
    return;
  }

  // Fetch owned games from Steam Web API
  const url = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/");
  url.searchParams.set("key", env.STEAM_API_KEY);
  url.searchParams.set("steamid", userRow.steamId);
  url.searchParams.set("include_appinfo", "true");
  url.searchParams.set("include_played_free_games", "true");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[steam] Steam API returned ${res.status} for user ${userId}`);
  }

  const json = (await res.json()) as SteamGetOwnedGamesResponse;
  const steamGames = json.response?.games ?? [];

  if (steamGames.length === 0) {
    // This can mean the profile is private — still update syncedAt
    log.info("0 games returned (profile may be private)", { userId });
    await db.update(user).set({ steamLibrarySyncedAt: new Date() }).where(eq(user.id, userId));
    return;
  }

  log.info("syncing Steam games", { userId, count: steamGames.length });

  // Process in batches to avoid long transactions
  const BATCH_SIZE = 100;
  let synced = 0;

  for (let i = 0; i < steamGames.length; i += BATCH_SIZE) {
    const batch = steamGames.slice(i, i + BATCH_SIZE);
    synced += await upsertBatch(userId, batch);
  }

  await db.update(user).set({ steamLibrarySyncedAt: new Date() }).where(eq(user.id, userId));
  log.info("sync complete", { userId, ownershipRowsProcessed: synced });

  // Fetch recently played — non-fatal if it fails (library sync already succeeded)
  await syncRecentlyPlayed(userId, userRow.steamId).catch((err: unknown) =>
    log.warn("recently played sync failed (non-fatal)", { userId, err: String(err) })
  );
}

async function syncRecentlyPlayed(userId: string, steamId: string): Promise<void> {
  if (!env.STEAM_API_KEY) {
    log.warn("STEAM_API_KEY not configured — skipping recently played sync", { userId });
    return;
  }

  const url = new URL("https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/");
  url.searchParams.set("key", env.STEAM_API_KEY);
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("count", "3");

  const res = await fetch(url);
  if (!res.ok) {
    // 401 = private profile; consume body to avoid socket leak, then log and skip
    await res.text();
    log.warn("GetRecentlyPlayedGames failed", { status: res.status, userId });
    return;
  }

  const json = (await res.json()) as SteamGetRecentlyPlayedResponse;
  const recentGames = json.response?.games ?? [];

  const entries: RecentlyPlayedEntry[] = recentGames
    .filter((g): g is SteamRecentGame & { name: string; playtime_2weeks: number } =>
      typeof g.name === "string" && typeof g.playtime_2weeks === "number"
    )
    .slice(0, 3)
    .map((g) => ({ appId: g.appid, name: g.name, playtime2weeks: g.playtime_2weeks }));

  await db
    .update(user)
    .set({ recentlyPlayedJson: entries.length > 0 ? entries : null, recentlyPlayedSyncedAt: new Date() })
    .where(eq(user.id, userId));

  log.info("recently played synced", { userId, count: entries.length });
}

/**
 * Upsert a batch of Steam games and the user's ownership records.
 * Returns the number of ownership rows processed (includes existing — actual
 * inserted count is lower when games were already in the DB).
 */
async function upsertBatch(userId: string, steamGames: SteamOwnedGame[]): Promise<number> {
  const appIds = steamGames.map((g) => String(g.appid));

  // Find which Steam app IDs already exist in our games table
  const existingGames = await db.query.games.findMany({
    where: and(
      eq(games.externalSource, "steam_app"),
      inArray(games.steamAppId, appIds),
    ),
    columns: { id: true, steamAppId: true },
  });

  const existingByAppId = new Map(
    existingGames.filter((g) => g.steamAppId).map((g) => [g.steamAppId!, g.id])
  );

  // Insert games that don't exist yet
  const toInsert = steamGames.filter((g) => !existingByAppId.has(String(g.appid)));

  if (toInsert.length > 0) {
    const newRows = toInsert.map((g) => ({
      id: createId(),
      title: g.name ?? `Steam App ${g.appid}`,
      externalSource: "steam_app" as const,
      externalId: String(g.appid),
      steamAppId: String(g.appid),
      // library_600x900.jpg is Steam's portrait capsule (600×900) — correct aspect
      // ratio for the grid card view. Available for most Steam apps; may 404 for
      // older or delisted titles (client falls back to a letter-initial placeholder).
      coverUrl: `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/library_600x900.jpg`,
    }));

    await db.insert(games).values(newRows).onConflictDoNothing();

    // Re-fetch IDs for newly inserted games (onConflictDoNothing means some may already exist)
    const freshGames = await db.query.games.findMany({
      where: and(
        eq(games.externalSource, "steam_app"),
        inArray(games.steamAppId, toInsert.map((g) => String(g.appid))),
      ),
      columns: { id: true, steamAppId: true },
    });
    for (const g of freshGames) {
      if (g.steamAppId) existingByAppId.set(g.steamAppId, g.id);
    }

    // SteamSpy snapshots for newly inserted games — run serially to avoid
    // hammering the unauthenticated API, which returns silent zero-value
    // responses when hit too fast (owners:"", averagePlaytimeForever:0).
    for (const g of freshGames) {
      if (g.steamAppId) {
        await snapshotSteamSpyData(g.id, g.steamAppId).catch((err: unknown) =>
          log.error("steamspy snapshot failed", { gameId: g.id, err: String(err) }),
        );
      }
    }
  }

  // Upsert ownership records (pc platform, steam source).
  //
  // Playtime semantics — high-water-mark: stored playtime is never decreased.
  //
  // Both "Steam says 0 minutes" and "Steam omitted the field" normalise to null
  // (Steam uses playtime_forever=0 for "never launched" AND for games where playtime
  // tracking is unavailable; there is no way to distinguish these). The COALESCE
  // on conflict preserves the existing non-null value in both cases. This means:
  //   - If a user genuinely plays 0 minutes after previously having playtime stored,
  //     the old value is kept. In practice this cannot happen — Steam playtime is
  //     cumulative and never decreases.
  //   - If Steam omits the field on a re-sync (partial response), existing data is kept.
  // lastPlayedAt follows the same semantics: null from Steam never overwrites a stored date.
  const ownershipRows = steamGames
    .map((g) => {
      const gameId = existingByAppId.get(String(g.appid));
      if (!gameId) return null;
      // rtime_last_played: 0 means "never played", undefined means "field omitted" —
      // both map to null and COALESCE preserves old data. Uses explicit !== undefined
      // check (consistent with playtimeMinutes below) to signal intent clearly.
      const lastPlayedAt =
        g.rtime_last_played !== undefined && g.rtime_last_played > 0
          ? new Date(g.rtime_last_played * 1000)
          : null;
      return {
        userId,
        gameId,
        platform: "pc" as const,
        source: "steam" as const,
        // 0 → null: Steam uses 0 for both "never launched" and "tracking unavailable".
        playtimeMinutes: g.playtime_forever !== undefined && g.playtime_forever > 0 ? g.playtime_forever : null,
        lastPlayedAt,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (ownershipRows.length > 0) {
    await db
      .insert(gameOwnerships)
      .values(ownershipRows)
      .onConflictDoUpdate({
        target: [gameOwnerships.userId, gameOwnerships.gameId, gameOwnerships.platform],
        set: {
          playtimeMinutes: sql`COALESCE(excluded.playtime_minutes, ${gameOwnerships.playtimeMinutes})`,
          lastPlayedAt: sql`COALESCE(excluded.last_played_at, ${gameOwnerships.lastPlayedAt})`,
        },
      });
  }

  return ownershipRows.length;
}
