import { Worker, Queue } from "bullmq";
import { bullmqConnection } from "@/server/redis";
import { processEmailJob } from "./processors/email";
import { processAccountJob } from "./processors/account";
import { processImageJob } from "./processors/image";
import { processOgFetchJob } from "./processors/og-fetch";
import { getAccountQueue } from "@/server/jobs/account-jobs";
import { imageQueue } from "@/server/jobs/image-jobs";
import type { EmailJobPayload } from "@/server/jobs/email-jobs";
import type { AccountJobPayload } from "@/server/jobs/account-jobs";
import type { ImageJobPayload } from "@/server/jobs/image-jobs";
import type { OgFetchJobPayload } from "@/server/jobs/og-fetch-jobs";

// Queue definitions — imported by other modules to enqueue jobs.
// accountQueue lives in server/jobs/account-jobs.ts (import from there directly).
// imageQueue lives in server/jobs/image-jobs.ts (import from there directly).
// ogFetchQueue lives in server/jobs/og-fetch-jobs.ts (import from there directly).
export const emailQueue = new Queue<EmailJobPayload>("email", { connection: bullmqConnection });
export { imageQueue };

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
      console.log(`[worker] registered repeatable job: ${label}`);
      return;
    } catch (err) {
      const isLast = attempt === maxAttempts;
      const delayMs = Math.min(1000 * 2 ** (attempt - 1), 30_000); // 1s, 2s, 4s, 8s, 16s → capped at 30s
      console.error(
        `[worker] failed to register ${label} (attempt ${attempt}/${maxAttempts})${isLast ? " — giving up" : `, retrying in ${delayMs}ms`}:`,
        err,
      );
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
  ]);
  console.log("Campfire workers started");
})().catch((err: unknown) => {
  console.error("[worker] fatal: could not register repeatable jobs after all retries:", err);
  process.exit(1);
});
