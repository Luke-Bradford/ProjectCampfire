import { Queue } from "bullmq";
import { bullmqConnection } from "@/server/redis";
import type { PushPayload } from "@/server/push";

// ── Job payload types ─────────────────────────────────────────────────────────

/**
 * Send a push notification to all active subscriptions for a user.
 * The processor looks up subscriptions from the DB and fans out to each one.
 * Invalid (expired) subscriptions are deleted automatically.
 */
export type SendPushPayload = {
  type: "send_push";
  userId: string;
  notification: PushPayload;
};

export type PushJobPayload = SendPushPayload;

// ── Queue ─────────────────────────────────────────────────────────────────────

export const pushQueue = new Queue<PushJobPayload>("push", {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// ── Enqueue helpers ───────────────────────────────────────────────────────────

export function enqueuePush(userId: string, notification: PushPayload) {
  return pushQueue.add("send_push", { type: "send_push", userId, notification });
}
