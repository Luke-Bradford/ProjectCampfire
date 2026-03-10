import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { polls, pollOptions, pollVotes, events, groupMemberships, groups } from "@/server/db/schema";
import { enqueuePollOpened, enqueuePollClosed } from "@/server/jobs/email-jobs";
import { enqueueClosePoll } from "@/server/jobs/poll-jobs";
import { env } from "@/env";

async function assertPollMember(pollId: string, userId: string) {
  const poll = await db.query.polls.findFirst({ where: eq(polls.id, pollId) });
  if (!poll) throw new TRPCError({ code: "NOT_FOUND" });

  // Resolve the group for this poll
  const groupId = poll.groupId ?? (poll.eventId
    ? (await db.query.events.findFirst({ where: eq(events.id, poll.eventId) }))?.groupId
    : null);

  if (!groupId) throw new TRPCError({ code: "NOT_FOUND" });

  const m = await db.query.groupMemberships.findFirst({
    where: and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, userId)),
  });
  if (!m) throw new TRPCError({ code: "FORBIDDEN" });

  return { poll, groupId };
}

const POLL_TYPES = ["time_slot", "game", "duration", "custom"] as const;

const pollOptionInput = z.object({
  label: z.string().min(1).max(200),
  gameId: z.string().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  sortOrder: z.number().int().default(0),
});

export const pollsRouter = createTRPCRouter({
  // Create a poll (attached to event or standalone group poll) (CAMP-062)
  create: protectedProcedure
    .input(
      z.object({
        eventId: z.string().optional(),
        groupId: z.string().optional(),
        type: z.enum(POLL_TYPES),
        question: z.string().min(1).max(300),
        allowMultipleVotes: z.boolean().default(false),
        closesAt: z.string().datetime().optional(),
        options: z.array(pollOptionInput).min(2).max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.eventId && !input.groupId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Provide eventId or groupId." });
      }

      // Determine the group to check membership
      let groupId = input.groupId;
      if (input.eventId && !groupId) {
        const event = await db.query.events.findFirst({ where: eq(events.id, input.eventId) });
        if (!event) throw new TRPCError({ code: "NOT_FOUND" });
        groupId = event.groupId;
      }

      const m = await db.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.groupId, groupId!),
          eq(groupMemberships.userId, ctx.user.id)
        ),
      });
      if (!m) throw new TRPCError({ code: "FORBIDDEN" });

      const id = createId();
      await db.insert(polls).values({
        id,
        eventId: input.eventId ?? null,
        groupId: input.groupId ?? null,
        type: input.type,
        question: input.question,
        allowMultipleVotes: input.allowMultipleVotes ? "true" : "false",
        closesAt: input.closesAt ? new Date(input.closesAt) : null,
        status: "open",
        createdBy: ctx.user.id,
      });

      for (const [i, opt] of input.options.entries()) {
        await db.insert(pollOptions).values({
          id: createId(),
          pollId: id,
          label: opt.label,
          gameId: opt.gameId ?? null,
          startsAt: opt.startsAt ? new Date(opt.startsAt) : null,
          endsAt: opt.endsAt ? new Date(opt.endsAt) : null,
          sortOrder: opt.sortOrder ?? i,
        });
      }

      // Schedule auto-close if closesAt is set.
      // jobId is stable (close_poll:{id}) so re-enqueuing is a safe no-op.
      if (input.closesAt) {
        const delay = new Date(input.closesAt).getTime() - Date.now();
        if (delay > 0) {
          void enqueueClosePoll(id, delay).catch((err: unknown) =>
            console.error(`[poll] failed to enqueue close_poll for ${id}:`, err),
          );
        }
      }

      // Notify group members that a new poll is open
      const group = await db.query.groups.findFirst({
        where: eq(groups.id, groupId!),
        columns: { name: true },
      });
      const members = await db.query.groupMemberships.findMany({
        where: eq(groupMemberships.groupId, groupId!),
        columns: { userId: true },
      });
      let eventTitle: string | undefined;
      if (input.eventId) {
        const ev = await db.query.events.findFirst({
          where: eq(events.id, input.eventId),
          columns: { title: true },
        });
        eventTitle = ev?.title;
      }
      // CTA links to the event page if event-scoped, otherwise the group page.
      const ctaUrl = input.eventId
        ? `${env.NEXT_PUBLIC_APP_URL}/events/${input.eventId}`
        : `${env.NEXT_PUBLIC_APP_URL}/groups/${groupId}`;
      void enqueuePollOpened({
        pollId: id,
        pollQuestion: input.question,
        groupName: group?.name ?? "your group",
        eventTitle,
        ctaUrl,
        recipientUserIds: members.map((m) => m.userId).filter((uid) => uid !== ctx.user.id),
      });

      return { id };
    }),

  // Get a poll with options and vote counts
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPollMember(input.id, ctx.user.id);

      const full = await db.query.polls.findFirst({
        where: eq(polls.id, input.id),
        with: {
          createdBy: { columns: { id: true, name: true, username: true } },
          options: {
            with: {
              votes: { columns: { userId: true } },
              game: { columns: { id: true, title: true } },
            },
            orderBy: (t, { asc }) => [asc(t.sortOrder)],
          },
        },
      });
      if (!full) throw new TRPCError({ code: "NOT_FOUND" });

      // Mark which options the current user voted for
      const myVotes = new Set(
        full.options.flatMap((o) =>
          o.votes.filter((v) => v.userId === ctx.user.id).map(() => o.id)
        )
      );

      return {
        ...full,
        allowMultipleVotes: full.allowMultipleVotes === "true",
        options: full.options.map((o) => ({
          ...o,
          voteCount: o.votes.length,
          iVoted: myVotes.has(o.id),
        })),
      };
    }),

  // Vote on a poll option (CAMP-063)
  vote: protectedProcedure
    .input(z.object({ pollOptionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const option = await db.query.pollOptions.findFirst({
        where: eq(pollOptions.id, input.pollOptionId),
      });
      if (!option) throw new TRPCError({ code: "NOT_FOUND" });

      const { poll } = await assertPollMember(option.pollId, ctx.user.id);
      if (poll.status === "closed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Poll is closed." });
      }

      const existing = await db.query.pollVotes.findFirst({
        where: and(
          eq(pollVotes.pollOptionId, input.pollOptionId),
          eq(pollVotes.userId, ctx.user.id)
        ),
      });

      if (existing) {
        // Toggle off
        await db
          .delete(pollVotes)
          .where(
            and(
              eq(pollVotes.pollOptionId, input.pollOptionId),
              eq(pollVotes.userId, ctx.user.id)
            )
          );
        return { voted: false };
      }

      // If single-vote poll, remove any existing votes on other options first
      if (poll.allowMultipleVotes !== "true") {
        const siblings = await db.query.pollOptions.findMany({
          where: eq(pollOptions.pollId, option.pollId),
          columns: { id: true },
        });
        for (const sib of siblings) {
          await db
            .delete(pollVotes)
            .where(
              and(eq(pollVotes.pollOptionId, sib.id), eq(pollVotes.userId, ctx.user.id))
            );
        }
      }

      await db.insert(pollVotes).values({
        pollOptionId: input.pollOptionId,
        userId: ctx.user.id,
      });
      return { voted: true };
    }),

  // Close a poll manually (creator only) (CAMP-064)
  close: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { poll, groupId } = await assertPollMember(input.id, ctx.user.id);
      if (poll.createdBy !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await db.update(polls).set({ status: "closed" }).where(eq(polls.id, input.id));

      // Notify users who voted that the poll is closed
      const [group, voters] = await Promise.all([
        db.query.groups.findFirst({
          where: eq(groups.id, groupId),
          columns: { name: true },
        }),
        db.query.pollVotes.findMany({
          where: (pv, { inArray: inArr }) =>
            inArr(
              pv.pollOptionId,
              db
                .select({ id: pollOptions.id })
                .from(pollOptions)
                .where(eq(pollOptions.pollId, input.id))
            ),
          columns: { userId: true },
        }),
      ]);
      const voterIds = [...new Set(voters.map((v) => v.userId))];
      const closedCtaUrl = poll.eventId
        ? `${env.NEXT_PUBLIC_APP_URL}/events/${poll.eventId}`
        : `${env.NEXT_PUBLIC_APP_URL}/groups/${groupId}`;
      void enqueuePollClosed({
        pollId: input.id,
        pollQuestion: poll.question,
        groupName: group?.name ?? "your group",
        ctaUrl: closedCtaUrl,
        recipientUserIds: voterIds,
      });

      return { id: input.id };
    }),
});
