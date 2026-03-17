import { z } from "zod";
import { eq, and, gt, asc, desc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { groups, groupMemberships, events, polls, posts, eventRsvps } from "@/server/db/schema";

// Discord invite URLs must be on discord.gg or discord.com/invite — no arbitrary URLs
const discordInviteUrl = z
  .string()
  .url()
  .refine(
    (v) => /^https:\/\/(discord\.gg\/|discord\.com\/invite\/)/.test(v),
    "Must be a discord.gg or discord.com/invite URL"
  )
  .optional()
  .or(z.literal(""));

export const groupsRouter = createTRPCRouter({
  // List groups the current user belongs to, with member count and next event
  list: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await db.query.groupMemberships.findMany({
      where: eq(groupMemberships.userId, ctx.user.id),
      with: { group: true },
    });

    const groupIds = memberships.map((m) => m.group.id);
    if (groupIds.length === 0) return [];

    // Batch: member counts, next event, active poll, last activity, and user's RSVP.
    // Note: N queries per set via Promise.all — acceptable at MVP group counts.
    const now = new Date();
    const [memberCounts, nextEvents, activePolls, lastPosts] = await Promise.all([
      Promise.all(
        groupIds.map((id) =>
          db.$count(groupMemberships, eq(groupMemberships.groupId, id)).then(
            (count) => ({ id, count })
          )
        )
      ),
      // One query per group: next confirmed event with confirmedStartsAt in the future.
      // confirmedStartsAt is stored as UTC; now is also UTC — comparison is safe.
      Promise.all(
        groupIds.map((id) =>
          db.query.events.findFirst({
            where: and(
              eq(events.groupId, id),
              gt(events.confirmedStartsAt, now),
              eq(events.status, "confirmed")
            ),
            orderBy: asc(events.confirmedStartsAt),
            columns: { id: true, title: true, confirmedStartsAt: true, status: true },
          }).then((ev) => ({ id, event: ev ?? null }))
        )
      ),
      // One query per group: first open poll attached to this group.
      Promise.all(
        groupIds.map((id) =>
          db.query.polls.findFirst({
            where: and(eq(polls.groupId, id), eq(polls.status, "open")),
            orderBy: desc(polls.createdAt),
            columns: { id: true, question: true, status: true },
          }).then((p) => ({ id, poll: p ?? null }))
        )
      ),
      // One query per group: most recent non-deleted post for "last active" timestamp.
      Promise.all(
        groupIds.map((id) =>
          db.query.posts.findFirst({
            where: eq(posts.groupId, id),
            orderBy: desc(posts.createdAt),
            columns: { createdAt: true },
          }).then((p) => ({ id, lastPostAt: p?.createdAt ?? null }))
        )
      ),
    ]);

    const memberCountMap = Object.fromEntries(memberCounts.map(({ id, count }) => [id, count]));
    const nextEventMap = Object.fromEntries(nextEvents.map(({ id, event }) => [id, event]));
    const activePollMap = Object.fromEntries(activePolls.map(({ id, poll }) => [id, poll]));
    const lastPostMap = Object.fromEntries(lastPosts.map(({ id, lastPostAt }) => [id, lastPostAt]));

    // Fetch the current user's RSVP for each group's next event (if any).
    const nextEventIds = nextEvents
      .map(({ event }) => event?.id)
      .filter((id): id is string => !!id);

    const myRsvps = nextEventIds.length > 0
      ? await db.query.eventRsvps.findMany({
          where: and(
            eq(eventRsvps.userId, ctx.user.id),
            inArray(eventRsvps.eventId, nextEventIds)
          ),
          columns: { eventId: true, status: true },
        })
      : [];
    const myRsvpMap = Object.fromEntries(myRsvps.map((r) => [r.eventId, r.status]));

    return memberships.map((m) => {
      const nextEvent = nextEventMap[m.group.id] ?? null;
      return {
        ...m.group,
        role: m.role,
        memberCount: memberCountMap[m.group.id] ?? 0,
        nextEvent: nextEvent
          ? { ...nextEvent, myRsvp: myRsvpMap[nextEvent.id] ?? null }
          : null,
        activePoll: activePollMap[m.group.id] ?? null,
        lastActivityAt: lastPostMap[m.group.id] ?? m.group.updatedAt,
      };
    });
  }),

  // Get a single group + its members (must be a member to view)
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const membership = await db.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.groupId, input.id),
          eq(groupMemberships.userId, ctx.user.id)
        ),
      });
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this group." });
      }
      const group = await db.query.groups.findFirst({
        where: eq(groups.id, input.id),
        with: {
          memberships: {
            with: {
              user: {
                columns: { id: true, name: true, username: true, image: true, status: true, currentGameName: true },
              },
            },
          },
        },
      });
      if (!group) throw new TRPCError({ code: "NOT_FOUND" });
      return { ...group, myRole: membership.role };
    }),

  // Create a new group (CAMP-040)
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        visibility: z.enum(["standard", "private"]).default("standard"),
        discordInviteUrl,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = createId();
      const inviteToken = createId();
      await db.insert(groups).values({
        id,
        name: input.name,
        description: input.description ?? null,
        visibility: input.visibility,
        discordInviteUrl: input.discordInviteUrl || null,
        inviteToken,
      });
      await db.insert(groupMemberships).values({
        groupId: id,
        userId: ctx.user.id,
        role: "owner",
      });
      return { id };
    }),

  // Update group settings — admin/owner only (CAMP-041)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        discordInviteUrl,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await db.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.groupId, input.id),
          eq(groupMemberships.userId, ctx.user.id)
        ),
        columns: { role: true },
      });
      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can edit group settings." });
      }
      const { id, ...fields } = input;
      await db
        .update(groups)
        .set({
          ...(fields.name !== undefined && { name: fields.name }),
          ...(fields.description !== undefined && { description: fields.description || null }),
          ...(fields.discordInviteUrl !== undefined && { discordInviteUrl: fields.discordInviteUrl || null }),
        })
        .where(eq(groups.id, id));
    }),

  // Join via invite token (CAMP-042)
  join: protectedProcedure
    .input(z.object({ inviteToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const group = await db.query.groups.findFirst({
        where: eq(groups.inviteToken, input.inviteToken),
        columns: { id: true, name: true },
      });
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite link." });

      const existing = await db.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.groupId, group.id),
          eq(groupMemberships.userId, ctx.user.id)
        ),
      });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Already a member." });

      await db.insert(groupMemberships).values({
        groupId: group.id,
        userId: ctx.user.id,
        role: "member",
      });
      return { id: group.id };
    }),

  // Leave a group (CAMP-045)
  leave: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.groupId, input.id),
          eq(groupMemberships.userId, ctx.user.id)
        ),
      });
      if (!membership) throw new TRPCError({ code: "NOT_FOUND" });
      if (membership.role === "owner") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Transfer ownership before leaving." });
      }
      await db.delete(groupMemberships).where(
        and(
          eq(groupMemberships.groupId, input.id),
          eq(groupMemberships.userId, ctx.user.id)
        )
      );
    }),

  // Remove a member from the group — admin/owner only (CAMP-046)
  removeMember: protectedProcedure
    .input(z.object({ groupId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Caller must be admin or owner
      const callerMembership = await db.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.groupId, input.groupId),
          eq(groupMemberships.userId, ctx.user.id)
        ),
        columns: { role: true },
      });
      if (!callerMembership || (callerMembership.role !== "owner" && callerMembership.role !== "admin")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can remove members." });
      }
      // Cannot remove yourself via this route — use leave instead
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Use the leave action to remove yourself." });
      }
      // Fetch target membership
      const targetMembership = await db.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.groupId, input.groupId),
          eq(groupMemberships.userId, input.userId)
        ),
        columns: { role: true },
      });
      if (!targetMembership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User is not a member of this group." });
      }
      // Cannot remove the owner
      if (targetMembership.role === "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot remove the group owner." });
      }
      // Admin cannot remove another admin
      if (callerMembership.role === "admin" && targetMembership.role === "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admins cannot remove other admins." });
      }
      await db.delete(groupMemberships).where(
        and(
          eq(groupMemberships.groupId, input.groupId),
          eq(groupMemberships.userId, input.userId)
        )
      );
    }),

  // Transfer ownership to another member — owner only (CAMP-047)
  transferOwnership: protectedProcedure
    .input(z.object({ groupId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You are already the owner." });
      }
      // Caller must be owner
      const callerMembership = await db.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.groupId, input.groupId),
          eq(groupMemberships.userId, ctx.user.id)
        ),
        columns: { role: true },
      });
      if (!callerMembership || callerMembership.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can transfer ownership." });
      }
      // Target must be a member
      const targetMembership = await db.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.groupId, input.groupId),
          eq(groupMemberships.userId, input.userId)
        ),
        columns: { role: true },
      });
      if (!targetMembership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User is not a member of this group." });
      }
      // Promote target to owner, demote self to admin — wrapped in a transaction
      // to prevent a window where the group temporarily has two owners or no owner
      // if the second update fails.
      await db.transaction(async (tx) => {
        await tx
          .update(groupMemberships)
          .set({ role: "owner" })
          .where(
            and(
              eq(groupMemberships.groupId, input.groupId),
              eq(groupMemberships.userId, input.userId)
            )
          );
        await tx
          .update(groupMemberships)
          .set({ role: "admin" })
          .where(
            and(
              eq(groupMemberships.groupId, input.groupId),
              eq(groupMemberships.userId, ctx.user.id)
            )
          );
      });
    }),

  // Archive a group — owner only (CAMP-048)
  // Archived groups are read-only: no new posts or events can be created.
  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.groupId, input.id),
          eq(groupMemberships.userId, ctx.user.id)
        ),
        columns: { role: true },
      });
      if (!membership || membership.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can archive the group." });
      }
      const now = new Date();
      await db
        .update(groups)
        .set({ archivedAt: now, updatedAt: now })
        .where(eq(groups.id, input.id));
    }),

  // Unarchive a group — owner only
  unarchive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.groupId, input.id),
          eq(groupMemberships.userId, ctx.user.id)
        ),
        columns: { role: true },
      });
      if (!membership || membership.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can unarchive the group." });
      }
      const now = new Date();
      await db
        .update(groups)
        .set({ archivedAt: null, updatedAt: now })
        .where(eq(groups.id, input.id));
    }),

  // Get invite token for sharing (members only)
  getInviteToken: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const membership = await db.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.groupId, input.id),
          eq(groupMemberships.userId, ctx.user.id)
        ),
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const group = await db.query.groups.findFirst({
        where: eq(groups.id, input.id),
        columns: { inviteToken: true },
      });
      return { inviteToken: group?.inviteToken ?? null };
    }),
});
