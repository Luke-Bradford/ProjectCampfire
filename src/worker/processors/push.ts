import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { pushSubscriptions } from "@/server/db/schema";
import { sendPush } from "@/server/push";
import type { PushJobPayload } from "@/server/jobs/push-jobs";
import { logger } from "@/lib/logger";

const log = logger.child("push");

export async function processPushJob(job: Job<PushJobPayload>) {
  const data = job.data;

  switch (data.type) {
    case "send_push": {
      const subs = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, data.userId));

      if (subs.length === 0) return;

      const results = await Promise.allSettled(
        subs.map(async (sub) => {
          const result = await sendPush(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            data.notification
          );
          if (result.expired) {
            // Subscription gone on the push service — remove from DB
            await db
              .delete(pushSubscriptions)
              .where(eq(pushSubscriptions.id, sub.id));
            log.info("push: removed expired subscription", { subId: sub.id, userId: data.userId });
          }
        })
      );

      const failed = results.filter((r) => r.status === "rejected");
      const succeeded = results.length - failed.length;
      if (failed.length > 0) {
        // Re-throw if ALL sends failed so BullMQ retries the whole job
        if (failed.length === results.length) {
          throw new Error(`All ${failed.length} push send(s) failed for user ${data.userId}`);
        }
        log.error("push: partial failure", { userId: data.userId, succeeded, failed: failed.length });
      } else {
        log.info("push: sent", { userId: data.userId, subCount: subs.length });
      }
      break;
    }

    default: {
      log.warn("push: unknown job type", { type: (data as { type: string }).type });
    }
  }
}
