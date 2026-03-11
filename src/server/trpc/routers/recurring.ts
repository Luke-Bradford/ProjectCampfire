import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { recurringTemplates, groupMemberships, groups } from "@/server/db/schema";

const DAY_OF_WEEK = z.number().int().min(0).max(6);
const TIME_REGEX = /^\d{2}:\d{2}$/;
const TIME = z.string().regex(TIME_REGEX, "Time must be HH:MM");
const GENERATED_STATUS = z.enum(["draft", "open"]);

/** Validate that a string is a recognised IANA timezone. Throws a Zod error if not. */
const TIMEZONE = z.string().min(1).max(64).superRefine((tz, ctx) => {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    ctx.addIssue({ code: "custom", message: `Unknown timezone: ${tz}` });
  }
});

async function assertAdminOrOwner(groupId: string, userId: string) {
  const m = await db.query.groupMemberships.findFirst({
    where: and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, userId)),
    columns: { role: true },
  });
  if (!m) throw new TRPCError({ code: "FORBIDDEN" });
  if (m.role !== "owner" && m.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only admins and owners can manage recurring templates." });
  }
  return m;
}

async function assertMember(groupId: string, userId: string) {
  const m = await db.query.groupMemberships.findFirst({
    where: and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, userId)),
  });
  if (!m) throw new TRPCError({ code: "FORBIDDEN" });
}

export const recurringRouter = createTRPCRouter({
  // List all templates for a group
  list: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertMember(input.groupId, ctx.user.id);
      return db.query.recurringTemplates.findMany({
        where: eq(recurringTemplates.groupId, input.groupId),
        orderBy: (t, { asc }) => [asc(t.createdAt)],
      });
    }),

  // Create a new recurring template (owner/admin only)
  create: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        dayOfWeek: DAY_OF_WEEK,
        startTime: TIME,
        endTime: TIME,
        timezone: TIMEZONE,
        leadDays: z.number().int().min(1).max(30).default(7),
        autoPoll: z.boolean().default(false),
        generatedEventStatus: GENERATED_STATUS.default("draft"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdminOrOwner(input.groupId, ctx.user.id);

      const group = await db.query.groups.findFirst({
        where: eq(groups.id, input.groupId),
        columns: { archivedAt: true },
      });
      if (group?.archivedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This group is archived." });
      }

      const id = createId();
      await db.insert(recurringTemplates).values({
        id,
        groupId: input.groupId,
        createdBy: ctx.user.id,
        title: input.title,
        description: input.description ?? null,
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        timezone: input.timezone,
        leadDays: input.leadDays,
        autoPoll: input.autoPoll,
        generatedEventStatus: input.generatedEventStatus,
        active: true,
      });
      return { id };
    }),

  // Update a recurring template (owner/admin only)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional().nullable(),
        dayOfWeek: DAY_OF_WEEK.optional(),
        startTime: TIME.optional(),
        endTime: TIME.optional(),
        timezone: TIMEZONE.optional(),
        leadDays: z.number().int().min(1).max(30).optional(),
        autoPoll: z.boolean().optional(),
        generatedEventStatus: GENERATED_STATUS.optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const template = await db.query.recurringTemplates.findFirst({
        where: eq(recurringTemplates.id, input.id),
        columns: { groupId: true },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });
      await assertAdminOrOwner(template.groupId, ctx.user.id);

      // Strip undefined values — Drizzle may interpret undefined as NULL
      const { id, ...rawFields } = input;
      const fields = Object.fromEntries(
        Object.entries(rawFields).filter(([, v]) => v !== undefined)
      ) as Partial<typeof rawFields>;

      await db
        .update(recurringTemplates)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(recurringTemplates.id, id));

      return { id };
    }),

  // Delete a recurring template (owner/admin only)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const template = await db.query.recurringTemplates.findFirst({
        where: eq(recurringTemplates.id, input.id),
        columns: { groupId: true },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });
      await assertAdminOrOwner(template.groupId, ctx.user.id);

      await db.delete(recurringTemplates).where(eq(recurringTemplates.id, input.id));
      return { id: input.id };
    }),
});
