import { z } from "zod";
import { and, eq, gte, lte, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { availabilityBlocks } from "@/server/db/schema";

const VISIBILITIES = ["friends", "group", "private"] as const;

const blockInput = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  label: z.string().max(100).optional(),
  visibility: z.enum(VISIBILITIES).default("friends"),
  groupId: z.string().optional(),
});

export const availabilityRouter = createTRPCRouter({
  // Create a new availability block (CAMP-050)
  create: protectedProcedure.input(blockInput).mutation(async ({ ctx, input }) => {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "End time must be after start time" });
    }
    const id = createId();
    await db.insert(availabilityBlocks).values({
      id,
      userId: ctx.user.id,
      startsAt,
      endsAt,
      label: input.label ?? null,
      visibility: input.visibility,
      groupId: input.groupId ?? null,
    });
    return { id };
  }),

  // Update an existing block (CAMP-051)
  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(blockInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const block = await db.query.availabilityBlocks.findFirst({
        where: eq(availabilityBlocks.id, input.id),
      });
      if (!block) throw new TRPCError({ code: "NOT_FOUND" });
      if (block.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      const startsAt = input.startsAt ? new Date(input.startsAt) : block.startsAt;
      const endsAt = input.endsAt ? new Date(input.endsAt) : block.endsAt;
      if (endsAt <= startsAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "End time must be after start time" });
      }

      await db
        .update(availabilityBlocks)
        .set({
          startsAt,
          endsAt,
          label: input.label !== undefined ? (input.label ?? null) : block.label,
          visibility: input.visibility ?? block.visibility,
          groupId: input.groupId !== undefined ? (input.groupId ?? null) : block.groupId,
        })
        .where(eq(availabilityBlocks.id, input.id));

      return { id: input.id };
    }),

  // Delete a block (CAMP-052)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const block = await db.query.availabilityBlocks.findFirst({
        where: eq(availabilityBlocks.id, input.id),
      });
      if (!block) throw new TRPCError({ code: "NOT_FOUND" });
      if (block.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await db.delete(availabilityBlocks).where(eq(availabilityBlocks.id, input.id));
      return { id: input.id };
    }),

  // My availability blocks within a date range
  myBlocks: protectedProcedure
    .input(
      z.object({
        from: z.string().datetime(),
        to: z.string().datetime(),
      })
    )
    .query(async ({ ctx, input }) => {
      return db.query.availabilityBlocks.findMany({
        where: and(
          eq(availabilityBlocks.userId, ctx.user.id),
          gte(availabilityBlocks.startsAt, new Date(input.from)),
          lte(availabilityBlocks.endsAt, new Date(input.to))
        ),
        orderBy: (t, { asc }) => [asc(t.startsAt)],
      });
    }),

  // All blocks visible to me within a group (CAMP-053)
  groupOverlap: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        from: z.string().datetime(),
        to: z.string().datetime(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { groupMemberships } = await import("@/server/db/schema");

      // Verify caller is a member
      const membership = await db.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.groupId, input.groupId),
          eq(groupMemberships.userId, ctx.user.id)
        ),
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      // Get all member IDs
      const allMembers = await db.query.groupMemberships.findMany({
        where: eq(groupMemberships.groupId, input.groupId),
      });
      const memberIds = allMembers.map((m) => m.userId);

      // Get blocks for all members that are visible (group or friends visibility)
      const blocks = await db.query.availabilityBlocks.findMany({
        where: and(
          or(...memberIds.map((id) => eq(availabilityBlocks.userId, id))),
          gte(availabilityBlocks.startsAt, new Date(input.from)),
          lte(availabilityBlocks.endsAt, new Date(input.to)),
          or(
            eq(availabilityBlocks.visibility, "friends"),
            and(
              eq(availabilityBlocks.visibility, "group"),
              eq(availabilityBlocks.groupId, input.groupId)
            )
          )
        ),
        with: {
          user: { columns: { id: true, name: true, username: true, image: true } },
        },
        orderBy: (t, { asc }) => [asc(t.startsAt)],
      });

      return blocks;
    }),
});
