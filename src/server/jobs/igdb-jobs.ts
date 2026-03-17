import { Queue } from "bullmq";
import { bullmqConnection } from "@/server/redis";

export type SweepIgdbReenrichmentPayload = {
  type: "sweep_igdb_reenrichment";
};

export type ReenrichIgdbGamePayload = {
  type: "reenrich_igdb_game";
  gameId: string;
  igdbId: number;
};

export type IgdbJobPayload = SweepIgdbReenrichmentPayload | ReenrichIgdbGamePayload;

let _queue: Queue<IgdbJobPayload> | null = null;

export function getIgdbQueue(): Queue<IgdbJobPayload> {
  if (!_queue) {
    _queue = new Queue<IgdbJobPayload>("igdb", {
      connection: bullmqConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return _queue;
}
