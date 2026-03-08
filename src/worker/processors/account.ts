import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user, session, account, verification } from "@/server/db/schema";
import type { AccountJobPayload } from "@/server/jobs/account-jobs";

export async function processAccountJob(job: Job<AccountJobPayload>) {
  const data = job.data;

  switch (data.type) {
    case "scrub_account": {
      const { userId } = data;

      // Scrub all PII from the user row, leaving id + deletedAt as tombstone.
      // Sessions/accounts/verifications have onDelete: cascade so they're already
      // gone, but we delete them explicitly here for belt-and-suspenders safety.
      await db.delete(session).where(eq(session.userId, userId));
      await db.delete(account).where(eq(account.userId, userId));
      await db.delete(verification).where(eq(verification.identifier, userId));

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
