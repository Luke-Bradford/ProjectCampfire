/**
 * IGDB API client (CAMP-107)
 *
 * IGDB uses Twitch OAuth for authentication. Tokens are cached in Redis
 * to avoid hitting the token endpoint on every request.
 *
 * Enabled only when IGDB_CLIENT_ID and IGDB_CLIENT_SECRET are set.
 */

import { env } from "@/env";
import { redis } from "@/server/redis";

const TOKEN_CACHE_KEY = "igdb:access_token";
const IGDB_API_URL = "https://api.igdb.com/v4";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";

// ── Types ─────────────────────────────────────────────────────────────────────

export type IgdbGame = {
  id: number;
  name: string;
  summary?: string;
  cover?: { url: string };
  genres?: { name: string }[];
  game_modes?: { name: string }[];
  multiplayer_modes?: {
    onlinemax?: number;
    onlinecoopmax?: number;
    offlinemax?: number;
    offlinecoopmax?: number;
  }[];
  external_games?: { category: number; uid: string }[];
};

// IGDB external_games category ID for Steam is 1
const STEAM_CATEGORY = 1;

// ── Token management ──────────────────────────────────────────────────────────

async function fetchNewToken(): Promise<{ token: string; ttl: number }> {
  if (!env.IGDB_CLIENT_ID || !env.IGDB_CLIENT_SECRET) {
    throw new Error("IGDB credentials not configured.");
  }

  // Credentials sent in the POST body, not the URL, to avoid appearing in server/proxy logs.
  const res = await fetch(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.IGDB_CLIENT_ID,
      client_secret: env.IGDB_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    throw new Error(`Twitch token request failed: ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  const ttl = Math.max(data.expires_in - 60, 60);
  return { token: data.access_token, ttl };
}

async function getAccessToken(): Promise<string> {
  const cached = await redis.get(TOKEN_CACHE_KEY);
  if (cached) return cached;

  const { token, ttl } = await fetchNewToken();
  await redis.setex(TOKEN_CACHE_KEY, ttl, token);
  return token;
}

// ── Query helper ──────────────────────────────────────────────────────────────

async function igdbQuery<T>(endpoint: string, body: string, retry = true): Promise<T> {
  const token = await getAccessToken();

  const res = await fetch(`${IGDB_API_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": env.IGDB_CLIENT_ID!,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body,
  });

  // On 401, the cached token may have been revoked or expired early (clock skew).
  // Invalidate the cache, fetch a fresh token, and retry once.
  if (res.status === 401 && retry) {
    await redis.del(TOKEN_CACHE_KEY);
    const { token: freshToken, ttl } = await fetchNewToken();
    await redis.setex(TOKEN_CACHE_KEY, ttl, freshToken);
    return igdbQuery<T>(endpoint, body, false);
  }

  if (!res.ok) {
    throw new Error(`IGDB ${endpoint} request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Search IGDB for games by name. Returns up to 10 results.
 */
export async function searchIgdbGames(query: string): Promise<IgdbGame[]> {
  return igdbQuery<IgdbGame[]>(
    "games",
    `search "${query.replace(/"/g, "")}";
fields id,name,summary,cover.url,genres.name,game_modes.name,multiplayer_modes.*,external_games.category,external_games.uid;
where version_parent = null;
limit 10;`
  );
}

/**
 * Fetch a single IGDB game by its numeric ID.
 */
export async function fetchIgdbGame(igdbId: number): Promise<IgdbGame | null> {
  if (!Number.isSafeInteger(igdbId) || igdbId <= 0) {
    throw new Error(`Invalid IGDB game ID: ${igdbId}`);
  }
  const results = await igdbQuery<IgdbGame[]>(
    "games",
    `fields id,name,summary,cover.url,genres.name,game_modes.name,multiplayer_modes.*,external_games.category,external_games.uid;
where id = ${igdbId};
limit 1;`
  );
  return results[0] ?? null;
}

/**
 * Whether IGDB is configured and available.
 */
export function igdbEnabled(): boolean {
  return !!(env.IGDB_CLIENT_ID && env.IGDB_CLIENT_SECRET);
}

/**
 * Derive player count bounds from IGDB multiplayer_modes data.
 * Returns { minPlayers, maxPlayers } or nulls if no data.
 */
export function derivePlayerCounts(game: IgdbGame): {
  minPlayers: number | null;
  maxPlayers: number | null;
} {
  const modes = game.multiplayer_modes;
  if (!modes || modes.length === 0) return { minPlayers: null, maxPlayers: null };

  let max = 0;
  for (const m of modes) {
    const candidates = [
      m.onlinemax ?? 0,
      m.onlinecoopmax ?? 0,
      m.offlinemax ?? 0,
      m.offlinecoopmax ?? 0,
    ];
    max = Math.max(max, ...candidates);
  }

  if (max <= 1) return { minPlayers: null, maxPlayers: null };
  return { minPlayers: 2, maxPlayers: max };
}

/**
 * Extract Steam App ID from IGDB external_games list, if present.
 */
export function extractSteamAppId(game: IgdbGame): string | null {
  const steamEntry = game.external_games?.find((e) => e.category === STEAM_CATEGORY);
  return steamEntry?.uid ?? null;
}

/**
 * Convert IGDB cover URL to a usable HTTPS URL.
 * IGDB returns protocol-relative URLs like //images.igdb.com/...
 * and thumbnail sizes like t_thumb — we upgrade to t_cover_big.
 */
export function normalizeCoverUrl(url: string | undefined): string | null {
  if (!url) return null;
  const https = url.startsWith("//") ? `https:${url}` : url;
  return https.replace("t_thumb", "t_cover_big");
}
