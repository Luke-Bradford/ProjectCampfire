import { Worker, Queue } from "bullmq";
import { bullmqConnection } from "@/server/redis";
import { processEmailJob } from "./processors/email";
import { processAccountJob } from "./processors/account";
import { processImageJob } from "./processors/image";
import { accountQueue } from "@/server/jobs/account-jobs";
import { imageQueue } from "@/server/jobs/image-jobs";
import type { EmailJobPayload } from "@/server/jobs/email-jobs";
import type { AccountJobPayload } from "@/server/jobs/account-jobs";
import type { ImageJobPayload } from "@/server/jobs/image-jobs";

// Queue definitions — imported by other modules to enqueue jobs.
// accountQueue lives in server/jobs/account-jobs.ts (import from there directly).
// imageQueue lives in server/jobs/image-jobs.ts (import from there directly).
export const emailQueue = new Queue<EmailJobPayload>("email", { connection: bullmqConnection });
export { imageQueue };
export const ogQueue = new Queue("og-fetch", { connection: bullmqConnection });

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
accountQueue.add(
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

// OG fetch worker
new Worker(
  "og-fetch",
  async (job) => {
    // TODO: implement OG tag fetch + post embed_metadata update
    console.log("Processing OG fetch job:", job.id, job.data);
  },
  { connection: bullmqConnection }
);

console.log("Campfire workers started");
