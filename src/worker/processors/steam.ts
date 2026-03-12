import type { Job } from "bullmq";
import { eq, and, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/server/db";
import { user, games, gameOwnerships } from "@/server/db/schema";
import { env } from "@/env";
import type { SteamJobPayload } from "@/server/jobs/steam-jobs";

export async function processSteamJob(job: Job<SteamJobPayload>): Promise<void> {
  const { data } = job;

  switch (data.type) {
    case "sync_steam_library": {
      await syncSteamLibrary(data.userId);
      break;
    }
    default: {
      console.warn("[steam] unknown job type:", (data as { type: string }).type);
    }
  }
}

// ── Steam API types ───────────────────────────────────────────────────────────

type SteamOwnedGame = {
  appid: number;
  name?: string;
  img_icon_url?: string;
  playtime_forever?: number;
};

type SteamGetOwnedGamesResponse = {
  response?: {
    game_count?: number;
    games?: SteamOwnedGame[];
  };
};

// ── Sync logic ────────────────────────────────────────────────────────────────

async function syncSteamLibrary(userId: string): Promise<void> {
  if (!env.STEAM_API_KEY) {
    console.warn("[steam] STEAM_API_KEY not configured — skipping sync for user", userId);
    return;
  }

  // Load the user's Steam ID
  const userRow = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { steamId: true, steamLibraryPublic: true },
  });

  if (!userRow?.steamId) {
    console.warn("[steam] user", userId, "has no Steam account linked — skipping");
    return;
  }

  // Fetch owned games from Steam Web API
  const url = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/");
  url.searchParams.set("key", env.STEAM_API_KEY);
  url.searchParams.set("steamid", userRow.steamId);
  url.searchParams.set("include_appinfo", "true");
  url.searchParams.set("include_played_free_games", "true");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`[steam] Steam API returned ${res.status} for user ${userId}`);
  }

  const json = (await res.json()) as SteamGetOwnedGamesResponse;
  const steamGames = json.response?.games ?? [];

  if (steamGames.length === 0) {
    // This can mean the profile is private — still update syncedAt
    console.log(`[steam] user ${userId}: 0 games returned (profile may be private)`);
    await db.update(user).set({ steamLibrarySyncedAt: new Date() }).where(eq(user.id, userId));
    return;
  }

  console.log(`[steam] user ${userId}: syncing ${steamGames.length} Steam game(s)`);

  // Process in batches to avoid long transactions
  const BATCH_SIZE = 100;
  let synced = 0;

  for (let i = 0; i < steamGames.length; i += BATCH_SIZE) {
    const batch = steamGames.slice(i, i + BATCH_SIZE);
    synced += await upsertBatch(userId, batch);
  }

  await db.update(user).set({ steamLibrarySyncedAt: new Date() }).where(eq(user.id, userId));
  console.log(`[steam] user ${userId}: sync complete — ${synced} game(s) upserted`);
}

/**
 * Upsert a batch of Steam games and the user's ownership records.
 * Returns the number of new ownerships inserted.
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

  const existingByAppId = new Map(existingGames.map((g) => [g.steamAppId!, g.id]));

  // Insert games that don't exist yet
  const toInsert = steamGames.filter((g) => !existingByAppId.has(String(g.appid)));

  if (toInsert.length > 0) {
    const newRows = toInsert.map((g) => ({
      id: createId(),
      title: g.name ?? `Steam App ${g.appid}`,
      externalSource: "steam_app" as const,
      externalId: String(g.appid),
      steamAppId: String(g.appid),
      coverUrl: g.img_icon_url
        ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
        : null,
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
      existingByAppId.set(g.steamAppId!, g.id);
    }
  }

  // Upsert ownership records (pc platform, steam source)
  const ownershipRows = steamGames
    .map((g) => {
      const gameId = existingByAppId.get(String(g.appid));
      if (!gameId) return null;
      return { userId, gameId, platform: "pc" as const, source: "steam" as const };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (ownershipRows.length > 0) {
    await db.insert(gameOwnerships).values(ownershipRows).onConflictDoNothing();
  }

  return ownershipRows.length;
}
