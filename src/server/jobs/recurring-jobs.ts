import { Queue } from "bullmq";
import { bullmqConnection } from "@/server/redis";

// ── Job payload types ─────────────────────────────────────────────────────────

export type GenerateRecurringEventsPayload = {
  type: "generate_recurring_events";
};

export type RecurringJobPayload = GenerateRecurringEventsPayload;

// ── Queue (lazy singleton) ────────────────────────────────────────────────────

let _recurringQueue: Queue<RecurringJobPayload> | null = null;

export function getRecurringQueue(): Queue<RecurringJobPayload> {
  if (!_recurringQueue) {
    _recurringQueue = new Queue<RecurringJobPayload>("recurring", {
      connection: bullmqConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    });
  }
  return _recurringQueue;
}
