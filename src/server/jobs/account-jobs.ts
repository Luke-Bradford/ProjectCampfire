import { Queue } from "bullmq";
import { bullmqConnection } from "@/server/redis";

export type ScrubAccountPayload = {
  type: "scrub_account";
  userId: string;
};

// Triggered by the hourly sweeper to re-enqueue any scrub jobs that were lost
// (e.g. Redis was down when deleteAccount fired the original enqueue).
export type SweepUnscrubedPayload = {
  type: "sweep_unscrubbed";
};

export type AccountJobPayload = ScrubAccountPayload | SweepUnscrubedPayload;

export const accountQueue = new Queue<AccountJobPayload>("account", {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export function enqueueScrubAccount(userId: string) {
  return accountQueue.add(
    "scrub_account",
    { type: "scrub_account", userId },
    // Small delay so the HTTP response completes before the job fires
    { delay: 2_000 },
  );
}
