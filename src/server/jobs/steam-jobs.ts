import { Queue } from "bullmq";
import { bullmqConnection } from "@/server/redis";

// ── Job payload types ─────────────────────────────────────────────────────────

export type SyncSteamLibraryPayload = {
  type: "sync_steam_library";
  userId: string;
};

export type SteamJobPayload = SyncSteamLibraryPayload;

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
 * Enqueue a Steam library sync for a user. Uses a stable jobId so duplicate
 * enqueues (e.g. rapid button presses) are deduplicated by BullMQ.
 */
export function enqueueSteamLibrarySync(userId: string) {
  return getSteamQueue().add(
    "sync_steam_library",
    { type: "sync_steam_library", userId },
    { jobId: `sync_steam_library:${userId}` },
  );
}
