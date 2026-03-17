import { Queue } from "bullmq";
import { bullmqConnection } from "@/server/redis";

// ── Job payload types ─────────────────────────────────────────────────────────

export type SyncSteamLibraryPayload = {
  type: "sync_steam_library";
  userId: string;
};

export type RefreshNowPlayingPayload = {
  type: "refresh_now_playing";
};

export type SteamJobPayload = SyncSteamLibraryPayload | RefreshNowPlayingPayload;

// ── Queue (lazy singleton) ────────────────────────────────────────────────────

let _steamQueue: Queue<SteamJobPayload> | null = null;

export function getSteamQueue(): Queue<SteamJobPayload> {
  if (!_steamQueue) {
    _steamQueue = new Queue<SteamJobPayload>("steam", {
      connection: bullmqConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return _steamQueue;
}

// ── Enqueue helpers ───────────────────────────────────────────────────────────

/**
 * Enqueue a Steam library sync for a user.
 *
 * No stable jobId — each enqueue creates a new job so that "Sync now"
 * always runs even after a previous sync completed. BullMQ's removeOnComplete
 * means completed jobs are evicted quickly, so a stable jobId would silently
 * no-op for re-syncs. Rapid-fire protection is handled by the UI (isPending).
 */
export function enqueueSteamLibrarySync(userId: string) {
  return getSteamQueue().add(
    "sync_steam_library",
    { type: "sync_steam_library", userId },
  );
}

/**
 * Register the repeatable "now playing" refresh job (every 5 minutes).
 * Called once at worker startup via registerRepeatableJob.
 */
export function enqueueRefreshNowPlaying() {
  return getSteamQueue().add(
    "refresh_now_playing",
    { type: "refresh_now_playing" },
    { repeat: { every: 5 * 60 * 1000 }, jobId: "refresh_now_playing" },
  );
}
