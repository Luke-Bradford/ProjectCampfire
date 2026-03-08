import type { Job } from "bullmq";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/server/db";
import { user, session, account } from "@/server/db/schema";
import type { AccountJobPayload } from "@/server/jobs/account-jobs";

export async function processAccountJob(job: Job<AccountJobPayload>) {
  const data = job.data;

  switch (data.type) {
    case "scrub_account": {
      const { userId } = data;

      await db.transaction(async (tx) => {
        // Guard: only proceed if deletedAt is set. This prevents the job from
        // touching a live account if a hypothetical undelete nulls deletedAt
        // while the job is still queued. Session/account deletion happens here
        // too so they're inside the same guard — not before it.
        //
        // Skip if already scrubbed (name is "[deleted]") to make retries idempotent.
        const target = await tx.query.user.findFirst({
          where: and(eq(user.id, userId), isNotNull(user.deletedAt)),
          columns: { name: true },
        });

        if (!target) {
          console.warn(`[account] scrub skipped — user ${userId} not found or not deleted`);
          return;
        }

        if (target.name === "[deleted]") {
          console.warn(`[account] scrub skipped — user ${userId} already scrubbed`);
          return;
        }

        // Belt-and-suspenders: session/account rows should already be gone from
        // the tRPC transaction, but re-delete here to cover retries and edge cases.
        await tx.delete(session).where(eq(session.userId, userId));
        await tx.delete(account).where(eq(account.userId, userId));

        await tx
          .update(user)
          .set({
            name: "[deleted]",
            email: `deleted-${userId}@invalid`,
            emailVerified: false,
            image: null,
            bio: null,
            username: null,
            usernameChangedAt: null,
            inviteToken: null,
            notificationPrefs: {},
          })
          .where(eq(user.id, userId));
      });

      console.log(`[account] scrubbed PII for user ${userId}`);
      break;
    }

    default: {
      console.warn("Unknown account job type:", (data as { type: string }).type);
    }
  }
}
