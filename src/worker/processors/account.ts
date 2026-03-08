import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user, session, account } from "@/server/db/schema";
import type { AccountJobPayload } from "@/server/jobs/account-jobs";

export async function processAccountJob(job: Job<AccountJobPayload>) {
  const data = job.data;

  switch (data.type) {
    case "scrub_account": {
      const { userId } = data;

      // Belt-and-suspenders: session and account rows should already be deleted
      // by the tRPC mutation transaction, but we re-delete here in case of retry
      // or edge cases. The verification table uses email as identifier, not userId,
      // so we leave it alone — those rows expire naturally.
      await db.delete(session).where(eq(session.userId, userId));
      await db.delete(account).where(eq(account.userId, userId));

      await db
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

      console.log(`[account] scrubbed PII for user ${userId}`);
      break;
    }

    default: {
      console.warn("Unknown account job type:", (data as { type: string }).type);
    }
  }
}
