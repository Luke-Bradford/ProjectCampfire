import { Queue } from "bullmq";
import { bullmqConnection } from "@/server/redis";

// ── Job payload types ─────────────────────────────────────────────────────────

export type ClosePollPayload = {
  type: "close_poll";
  pollId: string;
};

export type SweepOverduePollsPayload = {
  type: "sweep_overdue_polls";
};

export type PollJobPayload = ClosePollPayload | SweepOverduePollsPayload;

// ── Queue (lazy singleton) ────────────────────────────────────────────────────

let _pollQueue: Queue<PollJobPayload> | null = null;

export function getPollQueue(): Queue<PollJobPayload> {
  if (!_pollQueue) {
    _pollQueue = new Queue<PollJobPayload>("poll", {
      connection: bullmqConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return _pollQueue;
}

// ── Enqueue helpers ───────────────────────────────────────────────────────────

/**
 * Enqueue a delayed job to auto-close a poll when closesAt elapses.
 * delay is in milliseconds (closesAt.getTime() - Date.now()).
 * jobId is stable so re-enqueuing on duplicate poll create is a no-op.
 */
export function enqueueClosePoll(pollId: string, delay: number) {
  return getPollQueue().add(
    "close_poll",
    { type: "close_poll", pollId },
    { delay, jobId: `close_poll:${pollId}` },
  );
}
