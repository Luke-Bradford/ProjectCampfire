import { z } from "zod";
import { and, eq, gte, lte, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { availabilitySchedules, availabilityOverrides, friendships } from "@/server/db/schema";
import { expandAvailability, isValidTimeSlot, hasNoOverlaps } from "@/lib/availability-utils";

// ── Zod schemas ──────────────────────────────────────────────────────────────

const timeSlotSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm format"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm format"),
  endDayOffset: z.number().int().min(0).max(1).optional(),
  type: z.enum(["available", "busy"]).optional(),
  label: z.string().max(100).optional(),
});

const weeklySlotsSchema = z.record(
  z.string().regex(/^[0-6]$/),
  z.array(timeSlotSchema)
);

const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ── Router ───────────────────────────────────────────────────────────────────

export const availabilityRouter = createTRPCRouter({
  // ── Schedule CRUD ────────────────────────────────────────────────────────

  /** Get the current user's weekly schedule */
  getSchedule: protectedProcedure.query(async ({ ctx }) => {
    return (
      (await db.query.availabilitySchedules.findFirst({
        where: eq(availabilitySchedules.userId, ctx.user.id),
      })) ?? null
    );
  }),

  /**
   * Get another user's weekly schedule for display on their profile.
   * Visible to: the user themselves, or accepted friends.
   */
  getUserSchedule: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Own schedule — always allowed
      if (input.userId === ctx.user.id) {
        return (
          (await db.query.availabilitySchedules.findFirst({
            where: eq(availabilitySchedules.userId, ctx.user.id),
          })) ?? null
        );
      }

      // Must be an accepted friend to view another user's schedule
      const friendship = await db.query.friendships.findFirst({
        where: and(
          or(
            and(eq(friendships.requesterId, ctx.user.id), eq(friendships.addresseeId, input.userId)),
            and(eq(friendships.requesterId, input.userId), eq(friendships.addresseeId, ctx.user.id))
          ),
          eq(friendships.status, "accepted")
        ),
      });

      if (!friendship) return null;

      return (
        (await db.query.availabilitySchedules.findFirst({
          where: eq(availabilitySchedules.userId, input.userId),
        })) ?? null
      );
    }),

  /** Create or update the user's weekly schedule */
  upsertSchedule: protectedProcedure
    .input(
      z.object({
        timezone: z.string().min(1),
        slots: weeklySlotsSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate all slots
      for (const [day, daySlots] of Object.entries(input.slots)) {
        if (!daySlots) continue;
        for (const slot of daySlots) {
          if (!isValidTimeSlot(slot)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Invalid time slot on day ${day}: ${slot.start}-${slot.end}`,
            });
          }
        }
        if (!hasNoOverlaps(daySlots)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Overlapping slots on day ${day}`,
          });
        }
      }

      const existing = await db.query.availabilitySchedules.findFirst({
        where: eq(availabilitySchedules.userId, ctx.user.id),
      });

      if (existing) {
        await db
          .update(availabilitySchedules)
          .set({
            timezone: input.timezone,
            slots: input.slots,
            updatedAt: new Date(),
          })
          .where(eq(availabilitySchedules.id, existing.id));
        return { id: existing.id };
      }

      const id = createId();
      await db.insert(availabilitySchedules).values({
        id,
        userId: ctx.user.id,
        timezone: input.timezone,
        slots: input.slots,
      });
      return { id };
    }),

  /** Delete the user's weekly schedule */
  deleteSchedule: protectedProcedure.mutation(async ({ ctx }) => {
    await db
      .delete(availabilitySchedules)
      .where(eq(availabilitySchedules.userId, ctx.user.id));
    return { success: true };
  }),

  // ── Override CRUD ────────────────────────────────────────────────────────

  /** Set (create or update) an override for a specific date */
  setOverride: protectedProcedure
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        type: z.enum(["available", "busy"]).default("available"),
        slots: z.array(timeSlotSchema),
        label: z.string().max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate slots (only meaningful for "available" type)
      if (input.type === "available") {
        for (const slot of input.slots) {
          if (!isValidTimeSlot(slot)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Invalid time slot: ${slot.start}-${slot.end}`,
            });
          }
        }
        if (!hasNoOverlaps(input.slots)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Overlapping slots" });
        }
      }

      const existing = await db.query.availabilityOverrides.findFirst({
        where: and(
          eq(availabilityOverrides.userId, ctx.user.id),
          eq(availabilityOverrides.date, input.date)
        ),
      });

      if (existing) {
        await db
          .update(availabilityOverrides)
          .set({
            type: input.type,
            slots: input.slots,
            label: input.label ?? null,
          })
          .where(eq(availabilityOverrides.id, existing.id));
        return { id: existing.id };
      }

      const id = createId();
      await db.insert(availabilityOverrides).values({
        id,
        userId: ctx.user.id,
        date: input.date,
        type: input.type,
        slots: input.slots,
        label: input.label ?? null,
      });
      return { id };
    }),

  /** Delete an override by date */
  deleteOverride: protectedProcedure
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(availabilityOverrides)
        .where(
          and(
            eq(availabilityOverrides.userId, ctx.user.id),
            eq(availabilityOverrides.date, input.date)
          )
        );
      return { success: true };
    }),

  /** List overrides for the current user within a date range */
  listOverrides: protectedProcedure.input(dateRangeSchema).query(async ({ ctx, input }) => {
    return db.query.availabilityOverrides.findMany({
      where: and(
        eq(availabilityOverrides.userId, ctx.user.id),
        gte(availabilityOverrides.date, input.from),
        lte(availabilityOverrides.date, input.to)
      ),
      orderBy: (t, { asc }) => [asc(t.date)],
    });
  }),

  // ── Computed availability ────────────────────────────────────────────────

  /** Get computed availability for a user within a date range */
  computed: protectedProcedure
    .input(
      dateRangeSchema.extend({
        userId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const targetUserId = input.userId ?? ctx.user.id;

      // If viewing another user, could add friendship/visibility check here
      const schedule = await db.query.availabilitySchedules.findFirst({
        where: eq(availabilitySchedules.userId, targetUserId),
      });

      const overrides = await db.query.availabilityOverrides.findMany({
        where: and(
          eq(availabilityOverrides.userId, targetUserId),
          gte(availabilityOverrides.date, input.from),
          lte(availabilityOverrides.date, input.to)
        ),
      });

      return expandAvailability(schedule ?? null, overrides, input.from, input.to);
    }),

  /** Get computed availability for all members of a group (CAMP-053) */
  groupOverlap: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
      }).merge(dateRangeSchema)
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
        with: {
          user: { columns: { id: true, name: true, username: true, image: true } },
        },
      });

      // Compute availability for each member
      const memberAvailability = await Promise.all(
        allMembers.map(async (m) => {
          const schedule = await db.query.availabilitySchedules.findFirst({
            where: eq(availabilitySchedules.userId, m.userId),
          });
          const overrides = await db.query.availabilityOverrides.findMany({
            where: and(
              eq(availabilityOverrides.userId, m.userId),
              gte(availabilityOverrides.date, input.from),
              lte(availabilityOverrides.date, input.to)
            ),
          });

          return {
            user: m.user,
            slots: expandAvailability(schedule ?? null, overrides, input.from, input.to),
          };
        })
      );

      return memberAvailability;
    }),
});
