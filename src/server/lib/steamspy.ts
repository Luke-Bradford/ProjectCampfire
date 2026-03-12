import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { games } from "@/server/db/schema";

type SteamSpyAppDetails = {
  appid: number;
  name?: string;
  owners?: string;       // e.g. "20,000,000 .. 50,000,000"
  average_forever?: number; // avg playtime in minutes (all users)
  peak_ccu?: number;     // peak concurrent users
  [key: string]: unknown;
};

export type SteamSpyData = {
  owners: string;           // SteamSpy ownership range string
  averagePlaytimeForever: number; // minutes
  peakCcu: number;
};

/**
 * Fetch SteamSpy popularity data for a game and merge it into metadataJson.
 *
 * Uses the unauthenticated SteamSpy API (no API key required).
 * Data is merged into the existing metadataJson object under a `steamspy` key.
 * Silently no-ops on fetch failure — data is best-effort.
 */
export async function snapshotSteamSpyData(gameId: string, steamAppId: string): Promise<void> {
  const url = new URL("https://steamspy.com/api.php");
  url.searchParams.set("request", "appdetails");
  url.searchParams.set("appid", steamAppId);

  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    console.warn(`[steamspy] fetch failed for appId ${steamAppId}:`, err);
    return;
  }

  if (!res.ok) {
    console.warn(`[steamspy] API returned ${res.status} for appId ${steamAppId}`);
    return;
  }

  let json: SteamSpyAppDetails;
  try {
    json = (await res.json()) as SteamSpyAppDetails;
  } catch {
    console.warn(`[steamspy] failed to parse response for appId ${steamAppId}`);
    return;
  }

  // SteamSpy returns { appid: 0 } for unknown apps — intentionally falsy on 0.
  // Also catches completely malformed responses (e.g. undefined appid).
  if (!json.appid) {
    console.warn(`[steamspy] no data for appId ${steamAppId}`);
    return;
  }

  const steamspyData: SteamSpyData = {
    owners: json.owners ?? "",
    averagePlaytimeForever: json.average_forever ?? 0,
    peakCcu: json.peak_ccu ?? 0,
  };

  // Atomic jsonb merge — preserves existing keys (e.g. IGDB data) without a read-then-write race.
  // COALESCE handles the case where metadataJson is currently NULL.
  await db
    .update(games)
    .set({
      metadataJson: sql`COALESCE(${games.metadataJson}, '{}'::jsonb) || ${JSON.stringify({ steamspy: steamspyData })}::jsonb`,
    })
    .where(eq(games.id, gameId));
}
