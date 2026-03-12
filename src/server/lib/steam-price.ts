import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { games, type SteamPriceData } from "@/server/db/schema";

type SteamPriceOverview = {
  currency: string;
  initial: number;
  final: number;
  discount_percent: number;
  initial_formatted: string;
  final_formatted: string;
};

type SteamAppDetailsResponse = {
  [appId: string]: {
    success: boolean;
    data?: {
      is_free?: boolean;
      price_overview?: SteamPriceOverview;
    };
  };
};

/**
 * Fetch the current Steam Store price for a game and save it to the DB.
 *
 * Uses the unauthenticated store API (no API key required).
 * cc=us returns USD prices; free games have no price_overview.
 * Silently no-ops on fetch failure — price data is best-effort.
 */
export async function snapshotSteamPrice(gameId: string, steamAppId: string): Promise<void> {
  const url = new URL("https://store.steampowered.com/api/appdetails");
  url.searchParams.set("appids", steamAppId);
  url.searchParams.set("filters", "price_overview");
  url.searchParams.set("cc", "us");

  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    console.warn(`[steam-price] fetch failed for appId ${steamAppId}:`, err);
    return;
  }

  if (!res.ok) {
    console.warn(`[steam-price] Steam Store API returned ${res.status} for appId ${steamAppId}`);
    return;
  }

  let json: SteamAppDetailsResponse;
  try {
    json = (await res.json()) as SteamAppDetailsResponse;
  } catch {
    console.warn(`[steam-price] failed to parse response for appId ${steamAppId}`);
    return;
  }

  const appData = json[steamAppId];
  if (!appData?.success) {
    console.warn(`[steam-price] Steam returned success:false for appId ${steamAppId}`);
    return;
  }

  const price = appData.data?.price_overview;
  if (!price) {
    // Free game or no price data — clear any stale price
    await db
      .update(games)
      .set({ priceDataJson: null, priceSnapshotAt: new Date() })
      .where(eq(games.id, gameId));
    return;
  }

  const priceData: SteamPriceData = {
    currency: price.currency,
    initial: price.initial,
    final: price.final,
    discountPercent: price.discount_percent,
    initialFormatted: price.initial_formatted,
    finalFormatted: price.final_formatted,
  };

  await db
    .update(games)
    .set({ priceDataJson: priceData, priceSnapshotAt: new Date() })
    .where(eq(games.id, gameId));
}
