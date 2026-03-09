import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { groups, groupMemberships } from "@/server/db/schema";

export const groupsRouter = createTRPCRouter({
  // List groups the current user belongs to
  list: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await db.query.groupMemberships.findMany({
      where: eq(groupMemberships.userId, ctx.user.id),
      with: {
        group: true,
      },
    });
    return memberships.map((m) => ({ ...m.group, role: m.role }));
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
                columns: { id: true, name: true, username: true, image: true },
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
        discordInviteUrl: z.string().url().optional().or(z.literal("")),
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
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        discordInviteUrl: z.string().url().optional().or(z.literal("")),
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
