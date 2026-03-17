import { Worker } from "bullmq";
import { bullmqConnection } from "@/server/redis";
import { processEmailJob } from "./processors/email";
import { processAccountJob } from "./processors/account";
import { processImageJob } from "./processors/image";
import { processOgFetchJob } from "./processors/og-fetch";
import { processPollJob } from "./processors/poll";
import { processRecurringJob } from "./processors/recurring";
import { processSteamJob } from "./processors/steam";
import { getAccountQueue } from "@/server/jobs/account-jobs";
import { imageQueue } from "@/server/jobs/image-jobs";
import { getPollQueue } from "@/server/jobs/poll-jobs";
import { getRecurringQueue } from "@/server/jobs/recurring-jobs";
import { emailQueue } from "@/server/jobs/email-jobs";
import type { EmailJobPayload } from "@/server/jobs/email-jobs";
import type { AccountJobPayload } from "@/server/jobs/account-jobs";
import type { ImageJobPayload } from "@/server/jobs/image-jobs";
import type { OgFetchJobPayload } from "@/server/jobs/og-fetch-jobs";
import type { PollJobPayload } from "@/server/jobs/poll-jobs";
import type { RecurringJobPayload } from "@/server/jobs/recurring-jobs";
import type { SteamJobPayload } from "@/server/jobs/steam-jobs";
import { logger } from "@/lib/logger";

const log = logger.child("worker");

// Queue re-exports — consumers should import directly from server/jobs/*.
export { emailQueue, imageQueue };

/**
 * Register a repeatable BullMQ job with exponential backoff retry.
 *
 * If Redis is temporarily unavailable at worker startup, a plain `.catch`
 * means the job silently never runs until the next manual restart. Instead,
 * we retry up to MAX_ATTEMPTS times with exponential backoff. If all attempts
 * fail we throw, which crashes the worker process — Docker Compose (or the
 * process supervisor) will restart it, giving Redis more time to recover.
 */
async function registerRepeatableJob(
  label: string,
  register: () => Promise<unknown>,
  maxAttempts = 5,
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await register();
      log.info("registered repeatable job", { label });
      return;
    } catch (err) {
      const isLast = attempt === maxAttempts;
      const delayMs = Math.min(1000 * 2 ** (attempt - 1), 30_000); // 1s, 2s, 4s, 8s, 16s (30s cap is a safeguard for callers with higher maxAttempts)
      log.error("failed to register repeatable job", {
        label, attempt, maxAttempts, retryInMs: isLast ? undefined : delayMs, err: String(err),
      });
      if (isLast) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// Email worker
new Worker<EmailJobPayload>(
  "email",
  async (job) => {
    await processEmailJob(job);
  },
  { connection: bullmqConnection }
);

// Account management worker (soft-delete / PII scrub + hourly sweep)
new Worker<AccountJobPayload>(
  "account",
  async (job) => {
    await processAccountJob(job);
  },
  { connection: bullmqConnection }
);

// Image processing worker
new Worker<ImageJobPayload>(
  "image-processing",
  async (job) => {
    await processImageJob(job);
  },
  { connection: bullmqConnection }
);

// OG fetch worker
new Worker<OgFetchJobPayload>(
  "og-fetch",
  async (job) => {
    await processOgFetchJob(job);
  },
  { connection: bullmqConnection }
);

// Poll worker (delayed auto-close + overdue sweep)
new Worker<PollJobPayload>(
  "poll",
  async (job) => {
    await processPollJob(job);
  },
  { connection: bullmqConnection }
);

// Recurring event generator worker
new Worker<RecurringJobPayload>(
  "recurring",
  async (job) => {
    await processRecurringJob(job);
  },
  { connection: bullmqConnection }
);

// Steam library sync worker
new Worker<SteamJobPayload>(
  "steam",
  async (job) => {
    await processSteamJob(job);
  },
  { connection: bullmqConnection }
);

log.info("Campfire workers started");

// Repeatable jobs — registered with retry so a transient Redis blip at startup
// doesn't silently disable cleanup jobs. If all retries fail the process throws,
// which Docker Compose will restart (giving Redis time to recover).
(async () => {
  await Promise.all([
    // Hourly sweeper: finds deleted accounts where the scrub job was lost (e.g. Redis
    // was down during deleteAccount) and re-enqueues them. Fallback for the
    // fire-and-forget enqueue in the tRPC deleteAccount mutation.
    registerRepeatableJob("sweep_unscrubbed", () =>
      getAccountQueue().add(
        "sweep_unscrubbed",
        { type: "sweep_unscrubbed" },
        { repeat: { every: 60 * 60 * 1000 }, jobId: "sweep_unscrubbed" },
      )
    ),
    // Daily sweep: delete raw MinIO uploads with no processed counterpart older than 24h.
    registerRepeatableJob("sweep_orphaned_uploads", () =>
      imageQueue.add(
        "sweep_orphaned_uploads",
        { type: "sweep_orphaned_uploads" },
        { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: "sweep_orphaned_uploads" },
      )
    ),
    // Every 5 minutes: close any polls whose closesAt has passed but whose
    // delayed close_poll job was lost (e.g. Redis restart between poll creation
    // and deadline). This is the recovery mechanism for the delayed jobs.
    registerRepeatableJob("sweep_overdue_polls", () =>
      getPollQueue().add(
        "sweep_overdue_polls",
        { type: "sweep_overdue_polls" },
        { repeat: { every: 5 * 60 * 1000 }, jobId: "sweep_overdue_polls" },
      )
    ),
    // Daily: generate events from active recurring templates whose next occurrence
    // falls within their leadDays window. Idempotent — safe to re-run.
    registerRepeatableJob("generate_recurring_events", () =>
      getRecurringQueue().add(
        "generate_recurring_events",
        { type: "generate_recurring_events" },
        { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: "generate_recurring_events" },
      )
    ),
    // Daily feed digest sweep — enqueues per-user send_feed_digest jobs for daily subscribers.
    registerRepeatableJob("sweep_feed_digests:daily", () =>
      emailQueue.add(
        "sweep_feed_digests",
        { type: "sweep_feed_digests", frequency: "daily" },
        { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: "sweep_feed_digests:daily" },
      )
    ),
    // Weekly feed digest sweep — enqueues per-user send_feed_digest jobs for weekly subscribers.
    registerRepeatableJob("sweep_feed_digests:weekly", () =>
      emailQueue.add(
        "sweep_feed_digests",
        { type: "sweep_feed_digests", frequency: "weekly" },
        { repeat: { every: 7 * 24 * 60 * 60 * 1000 }, jobId: "sweep_feed_digests:weekly" },
      )
    ),
  ]);
  log.info("Campfire repeatable jobs registered");
})().catch((err: unknown) => {
  log.error("fatal: could not register repeatable jobs after all retries", { err: String(err) });
  process.exit(1);
});
