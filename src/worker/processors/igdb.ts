import type { Job } from "bullmq";
import { and, eq, isNotNull, lt, or, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { games } from "@/server/db/schema";
import {
  fetchIgdbGame,
  igdbEnabled,
  derivePlayerCounts,
  normalizeCoverUrl,
  extractSteamAppId,
} from "@/server/igdb";
import { getIgdbQueue } from "@/server/jobs/igdb-jobs";
import type { IgdbJobPayload } from "@/server/jobs/igdb-jobs";
import { logger } from "@/lib/logger";

const log = logger.child("igdb");

// Re-enrich IGDB games older than 90 days (or never enriched).
// The sweep fans out per-game jobs rather than processing inline to keep
// each unit of work small and independently retryable.
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

// Batch size for the sweep query — prevents unbounded IN-clause or memory use.
const SWEEP_BATCH_SIZE = 200;

export async function processIgdbJob(job: Job<IgdbJobPayload>): Promise<void> {
  const { data } = job;

  switch (data.type) {
    case "sweep_igdb_reenrichment": {
      await sweepIgdbReenrichment();
      break;
    }
    case "reenrich_igdb_game": {
      await reenrichIgdbGame(data.gameId, data.igdbId);
      break;
    }
    default: {
      log.warn("unknown igdb job type", { type: (data as { type: string }).type });
    }
  }
}

// ── Sweep ─────────────────────────────────────────────────────────────────────

async function sweepIgdbReenrichment(): Promise<void> {
  if (!igdbEnabled()) {
    log.info("IGDB not configured — skipping re-enrichment sweep");
    return;
  }

  const threshold = new Date(Date.now() - NINETY_DAYS_MS);

  // Find IGDB-sourced games whose metadata is stale (never enriched, or enriched
  // > 90 days ago). externalId holds the numeric IGDB ID as a string.
  const staleGames = await db
    .select({ id: games.id, externalId: games.externalId })
    .from(games)
    .where(
      and(
        eq(games.externalSource, "igdb"),
        isNotNull(games.externalId),
        or(
          isNull(games.igdbEnrichedAt),
          lt(games.igdbEnrichedAt, threshold),
        )
      )
    )
    .limit(SWEEP_BATCH_SIZE);

  if (staleGames.length === 0) {
    log.info("igdb re-enrichment sweep: nothing stale");
    return;
  }

  const queue = getIgdbQueue();
  await queue.addBulk(
    staleGames.map((g) => ({
      name: "reenrich_igdb_game",
      data: {
        type: "reenrich_igdb_game" as const,
        gameId: g.id,
        igdbId: parseInt(g.externalId!, 10),
      },
    }))
  );

  log.info("igdb re-enrichment sweep: enqueued", { count: staleGames.length });
}

// ── Per-game re-enrichment ────────────────────────────────────────────────────

async function reenrichIgdbGame(gameId: string, igdbId: number): Promise<void> {
  const igdbGame = await fetchIgdbGame(igdbId);

  if (!igdbGame) {
    // Game removed from IGDB — stamp enrichedAt so we don't keep retrying
    await db
      .update(games)
      .set({ igdbEnrichedAt: new Date(), updatedAt: new Date() })
      .where(eq(games.id, gameId));
    log.warn("igdb re-enrichment: game not found on IGDB, stamped enrichedAt", { gameId, igdbId });
    return;
  }

  const { minPlayers, maxPlayers } = derivePlayerCounts(igdbGame);
  const steamAppId = extractSteamAppId(igdbGame);
  const coverUrl = normalizeCoverUrl(igdbGame.cover?.url);
  const genres = igdbGame.genres?.map((g) => g.name) ?? [];

  await db
    .update(games)
    .set({
      title: igdbGame.name,
      description: igdbGame.summary ?? null,
      coverUrl,
      minPlayers,
      maxPlayers,
      genres,
      // Only update steamAppId when IGDB now provides one — don't overwrite an
      // existing value with null if IGDB's external_games list changes
      ...(steamAppId ? { steamAppId } : {}),
      // Atomic jsonb merge — preserves existing keys (e.g. steamspy data) without
      // a read-then-write race. Matches the pattern in server/lib/steamspy.ts.
      metadataJson: sql`COALESCE(${games.metadataJson}, '{}'::jsonb) || ${JSON.stringify({ igdb: igdbGame })}::jsonb`,
      igdbEnrichedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(games.id, gameId));

  log.info("igdb re-enrichment: updated", { gameId, igdbId, title: igdbGame.name });
}
