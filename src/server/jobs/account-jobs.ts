import { Queue } from "bullmq";
import { bullmqConnection } from "@/server/redis";

export type ScrubAccountPayload = {
  type: "scrub_account";
  userId: string;
};

export type AccountJobPayload = ScrubAccountPayload;

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
