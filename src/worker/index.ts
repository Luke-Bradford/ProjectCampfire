import { Worker, Queue } from "bullmq";
import { bullmqConnection } from "@/server/redis";
import { processEmailJob } from "./processors/email";
import { processAccountJob } from "./processors/account";
import type { EmailJobPayload } from "@/server/jobs/email-jobs";
import type { AccountJobPayload } from "@/server/jobs/account-jobs";

// Queue definitions — imported by other modules to enqueue jobs.
// accountQueue lives in server/jobs/account-jobs.ts (import from there directly).
export const emailQueue = new Queue<EmailJobPayload>("email", { connection: bullmqConnection });
export const imageQueue = new Queue("image-processing", {
  connection: bullmqConnection,
});
export const ogQueue = new Queue("og-fetch", { connection: bullmqConnection });

// Email worker
new Worker<EmailJobPayload>(
  "email",
  async (job) => {
    await processEmailJob(job);
  },
  { connection: bullmqConnection }
);

// Account management worker (soft-delete / PII scrub)
new Worker<AccountJobPayload>(
  "account",
  async (job) => {
    await processAccountJob(job);
  },
  { connection: bullmqConnection }
);

// Image processing worker
new Worker(
  "image-processing",
  async (job) => {
    // TODO: implement Sharp resize + MinIO upload
    console.log("Processing image job:", job.id, job.data);
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
