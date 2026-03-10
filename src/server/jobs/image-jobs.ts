import { Queue } from "bullmq";
import { bullmqConnection } from "@/server/redis";

export type ImageJobPayload =
  | { type: "process_avatar"; userId: string; key: string }
  | { type: "process_post_image"; postId: string; key: string; index: number }
  | { type: "sweep_orphaned_uploads" };

export const imageQueue = new Queue<ImageJobPayload>("image-processing", {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export function enqueueProcessAvatar(userId: string, key: string) {
  return imageQueue.add("process_avatar", { type: "process_avatar", userId, key });
}

export function enqueueProcessPostImage(postId: string, key: string, index: number) {
  return imageQueue.add("process_post_image", {
    type: "process_post_image",
    postId,
    key,
    index,
  });
}
