import type { Job } from "bullmq";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/server/db";
import { user, session, account } from "@/server/db/schema";
import { getAccountQueue } from "@/server/jobs/account-jobs";
import type { AccountJobPayload } from "@/server/jobs/account-jobs";

export async function processAccountJob(job: Job<AccountJobPayload>) {
  const data = job.data;

  switch (data.type) {
    case "scrub_account": {
      const { userId } = data;
      let didScrub = false;

      await db.transaction(async (tx) => {
        // Guard: only proceed if deletedAt is set and PII hasn't been scrubbed yet.
        // piiScrubbed is the robust idempotency sentinel — unlike checking a name
        // sentinel, it cannot collide with a real user's display name.
        const target = await tx.query.user.findFirst({
          where: and(eq(user.id, userId), isNotNull(user.deletedAt)),
          columns: { piiScrubbed: true },
        });

        if (!target) {
          console.warn(`[account] scrub skipped — user ${userId} not found or not deleted`);
          return;
        }

        if (target.piiScrubbed) {
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
            piiScrubbed: true,
          })
          .where(eq(user.id, userId));

        didScrub = true;
      });

      if (didScrub) {
        console.log(`[account] scrubbed PII for user ${userId}`);
      }
      break;
    }

    case "sweep_unscrubbed": {
      // Find accounts that are soft-deleted but whose scrub job never ran
      // (e.g. Redis was down when deleteAccount fired). Re-enqueue each one.
      // Capped at 100 per sweep to avoid overwhelming Redis on burst recovery;
      // subsequent hourly runs will drain any larger backlog.
      const unscrubbed = await db.query.user.findMany({
        where: and(isNotNull(user.deletedAt), eq(user.piiScrubbed, false)),
        columns: { id: true },
        limit: 100,
      });

      if (unscrubbed.length === 0) break;

      await Promise.all(
        unscrubbed.map((u) =>
          // Deterministic jobId deduplicates: if a scrub job is already queued
          // for this user, BullMQ will not add a second one.
          getAccountQueue().add(
            "scrub_account",
            { type: "scrub_account", userId: u.id },
            { jobId: `scrub-${u.id}` },
          ),
        ),
      );
      console.log(`[account] sweep re-enqueued ${unscrubbed.length} scrub job(s)`);
      break;
    }

    default: {
      const _exhaustive: never = data;
      console.warn("Unknown account job type:", (_exhaustive as { type: string }).type);
    }
  }
}
