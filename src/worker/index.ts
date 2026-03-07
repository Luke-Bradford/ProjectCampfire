import { Worker, Queue } from "bullmq";
import { bullmqConnection } from "@/server/redis";

// Queue definitions — imported by other modules to enqueue jobs
export const emailQueue = new Queue("email", { connection: bullmqConnection });
export const imageQueue = new Queue("image-processing", {
  connection: bullmqConnection,
});
export const ogQueue = new Queue("og-fetch", { connection: bullmqConnection });

// Email worker
new Worker(
  "email",
  async (job) => {
    // TODO: implement email sending via nodemailer
    console.log("Processing email job:", job.id, job.data);
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
