import type { Job } from "bullmq";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { polls, pollOptions, groups } from "@/server/db/schema";
import { enqueuePollClosed } from "@/server/jobs/email-jobs";
import type { PollJobPayload } from "@/server/jobs/poll-jobs";
import { env } from "@/env";
import { logger } from "@/lib/logger";

const log = logger.child("poll");

export async function processPollJob(job: Job<PollJobPayload>): Promise<void> {
  const { data } = job;

  switch (data.type) {
    case "close_poll": {
      await closePoll(data.pollId);
      break;
    }

    case "sweep_overdue_polls": {
      // Find all open polls whose closesAt has passed. This is the fallback
      // recovery path for polls whose delayed close_poll job was lost (e.g.
      // Redis restart between poll creation and closesAt).
      const overdue = await db.query.polls.findMany({
        where: and(
          eq(polls.status, "open"),
          lt(polls.closesAt, new Date()),
        ),
        columns: { id: true },
      });
      if (overdue.length === 0) {
        log.debug("sweep_overdue_polls: no overdue polls");
        break;
      }
      log.info("sweep_overdue_polls: closing overdue polls", { count: overdue.length });
      const results = await Promise.allSettled(overdue.map((p) => closePoll(p.id)));
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        log.error("sweep_overdue_polls: some polls failed to close", { failures: failures.length });
      }
      break;
    }

    default: {
      log.warn("unknown job type", { type: (data as { type: string }).type });
    }
  }
}

/**
 * Close a poll: set status=closed and notify voters by email.
 * Idempotent — if the poll is already closed (or doesn't exist), this is a no-op.
 *
 * The UPDATE includes `status = 'open'` in the WHERE clause so the check-then-act
 * is atomic at the DB level, eliminating the TOCTOU race between a concurrent
 * manual close and this worker job.
 */
async function closePoll(pollId: string): Promise<void> {
  const poll = await db.query.polls.findFirst({
    where: eq(polls.id, pollId),
    columns: { id: true, question: true, groupId: true, eventId: true },
  });

  if (!poll) {
    log.warn("close_poll: poll not found — skipping", { pollId });
    return;
  }

  // Atomically close only if still open — prevents double-notification if the
  // creator closed manually between the findFirst above and this update.
  const [updated] = await db
    .update(polls)
    .set({ status: "closed" })
    .where(and(eq(polls.id, pollId), eq(polls.status, "open")))
    .returning({ id: polls.id });

  if (!updated) {
    log.debug("close_poll: already closed — skipping", { pollId });
    return;
  }
  log.info("poll closed", { pollId });

  // Resolve groupId for the email notification
  let groupId = poll.groupId;
  if (!groupId && poll.eventId) {
    const eventId = poll.eventId; // narrow to string (poll.eventId guard above)
    const ev = await db.query.events.findFirst({
      where: (t) => eq(t.id, eventId),
      columns: { groupId: true },
    });
    groupId = ev?.groupId ?? null;
  }

  const [group, voters] = await Promise.all([
    groupId
      ? db.query.groups.findFirst({ where: eq(groups.id, groupId), columns: { name: true } })
      : Promise.resolve(null),
    db.query.pollVotes.findMany({
      where: (pv, { inArray: inArr }) =>
        inArr(
          pv.pollOptionId,
          db.select({ id: pollOptions.id }).from(pollOptions).where(eq(pollOptions.pollId, pollId)),
        ),
      columns: { userId: true },
    }),
  ]);

  if (!poll.eventId && !groupId) {
    log.warn("poll has no eventId or groupId — CTA will link to app root", { pollId });
  }
  const ctaUrl = poll.eventId
    ? `${env.NEXT_PUBLIC_APP_URL}/events/${poll.eventId}`
    : groupId
      ? `${env.NEXT_PUBLIC_APP_URL}/groups/${groupId}`
      : env.NEXT_PUBLIC_APP_URL;

  const voterIds = [...new Set(voters.map((v) => v.userId))];
  if (voterIds.length > 0) {
    void enqueuePollClosed({
      pollId,
      pollQuestion: poll.question,
      groupName: group?.name ?? "your group",
      ctaUrl,
      recipientUserIds: voterIds,
    }).catch((err: unknown) =>
      log.error("failed to enqueue poll_closed email", { pollId, err: String(err) }),
    );
  }
}
