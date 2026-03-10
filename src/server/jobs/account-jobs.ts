import { Queue } from "bullmq";
import { bullmqConnection } from "@/server/redis";

export type ScrubAccountPayload = {
  type: "scrub_account";
  userId: string;
};

// Triggered by the hourly sweeper to re-enqueue any scrub jobs that were lost
// (e.g. Redis was down when deleteAccount fired the original enqueue).
export type SweepUnscrubbedPayload = {
  type: "sweep_unscrubbed";
};

export type AccountJobPayload = ScrubAccountPayload | SweepUnscrubbedPayload;

// Lazy singleton — created on first call so that importing this module in a
// Next.js server context (e.g. via the tRPC user router) does not open a
// Redis connection on every cold start, only when a job is actually enqueued.
let _accountQueue: Queue<AccountJobPayload> | undefined;

export function getAccountQueue(): Queue<AccountJobPayload> {
  if (!_accountQueue) {
    _accountQueue = new Queue<AccountJobPayload>("account", {
      connection: bullmqConnection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return _accountQueue;
}

export function enqueueScrubAccount(userId: string) {
  return getAccountQueue().add(
    "scrub_account",
    { type: "scrub_account", userId },
    // Small delay so the HTTP response completes before the job fires
    { delay: 2_000 },
  );
}
