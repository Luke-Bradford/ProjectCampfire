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
        // Belt-and-suspenders: session and account rows should already be deleted
        // by the tRPC mutation transaction, but we re-delete here in case of retry
        // or edge cases. The verification table uses email as identifier, not userId,
        // so we leave it alone — those rows expire naturally.
        await tx.delete(session).where(eq(session.userId, userId));
        await tx.delete(account).where(eq(account.userId, userId));

        // Guard: only scrub PII if the account is still soft-deleted. Prevents
        // destroying a live account if a race condition reverses the deletion.
        const updated = await tx
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
          .where(and(eq(user.id, userId), isNotNull(user.deletedAt)))
          .returning({ id: user.id });

        if (updated.length === 0) {
          console.warn(`[account] scrub skipped — user ${userId} not found or not deleted`);
          return;
        }
      });

      console.log(`[account] scrubbed PII for user ${userId}`);
      break;
    }

    default: {
      console.warn("Unknown account job type:", (data as { type: string }).type);
    }
  }
}
