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

// Hourly sweeper: finds deleted accounts where the scrub job was lost (e.g. Redis
// was down during deleteAccount) and re-enqueues them. This is the fallback
// recovery mechanism for the fire-and-forget enqueue in the tRPC mutation.
getAccountQueue().add(
  "sweep_unscrubbed",
  { type: "sweep_unscrubbed" },
  { repeat: { every: 60 * 60 * 1000 }, jobId: "sweep_unscrubbed" },
).catch((err: unknown) =>
  console.error("[worker] failed to register sweep_unscrubbed repeatable job:", err),
);

// Image processing worker
new Worker<ImageJobPayload>(
  "image-processing",
  async (job) => {
    await processImageJob(job);
  },
  { connection: bullmqConnection }
);

// Daily sweep: delete raw uploads with no processed counterpart older than 24h.
// Runs every 24 hours. jobId is stable so BullMQ deduplicates across restarts.
imageQueue.add(
  "sweep_orphaned_uploads",
  { type: "sweep_orphaned_uploads" },
  { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: "sweep_orphaned_uploads" },
).catch((err: unknown) =>
  console.error("[worker] failed to register sweep_orphaned_uploads repeatable job:", err),
);

// OG fetch worker
new Worker<OgFetchJobPayload>(
  "og-fetch",
  async (job) => {
    await processOgFetchJob(job);
  },
  { connection: bullmqConnection }
);

console.log("Campfire workers started");
