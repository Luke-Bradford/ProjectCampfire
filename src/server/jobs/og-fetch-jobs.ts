import { Queue } from "bullmq";
import { bullmqConnection } from "@/server/redis";

export type OgFetchJobPayload = {
  type: "fetch_og";
  postId: string;
  url: string;
};

export const ogFetchQueue = new Queue<OgFetchJobPayload>("og-fetch", {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export function enqueueOgFetch(postId: string, url: string) {
  return ogFetchQueue.add("fetch_og", { type: "fetch_og", postId, url });
}
