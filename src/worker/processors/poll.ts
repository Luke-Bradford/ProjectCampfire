import type { Job } from "bullmq";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { polls, pollOptions, groups } from "@/server/db/schema";
import { enqueuePollClosed } from "@/server/jobs/email-jobs";
import type { PollJobPayload } from "@/server/jobs/poll-jobs";

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
        console.log("[poll] sweep_overdue_polls: no overdue polls");
        break;
      }
      console.log(`[poll] sweep_overdue_polls: closing ${overdue.length} overdue poll(s)`);
      await Promise.all(overdue.map((p) => closePoll(p.id)));
      break;
    }

    default: {
      console.warn("[poll] unknown job type:", (data as { type: string }).type);
    }
  }
}

/**
 * Close a poll: set status=closed and notify voters by email.
 * Idempotent — if the poll is already closed, this is a no-op.
 */
async function closePoll(pollId: string): Promise<void> {
  const poll = await db.query.polls.findFirst({
    where: eq(polls.id, pollId),
    columns: { id: true, status: true, question: true, groupId: true, eventId: true },
  });

  if (!poll) {
    console.warn(`[poll] close_poll: poll ${pollId} not found — skipping`);
    return;
  }
  if (poll.status === "closed") {
    console.log(`[poll] close_poll: poll ${pollId} already closed — skipping`);
    return;
  }

  await db.update(polls).set({ status: "closed" }).where(eq(polls.id, pollId));
  console.log(`[poll] closed poll ${pollId}`);

  // Resolve groupId for the email notification
  let groupId = poll.groupId;
  if (!groupId && poll.eventId) {
    const ev = await db.query.events.findFirst({
      where: (t) => eq(t.id, poll.eventId!),
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

  const voterIds = [...new Set(voters.map((v) => v.userId))];
  if (voterIds.length > 0) {
    void enqueuePollClosed({
      pollId,
      pollQuestion: poll.question,
      groupName: group?.name ?? "your group",
      recipientUserIds: voterIds,
    });
  }
}
