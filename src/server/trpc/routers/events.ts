import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { events, eventRsvps, groupMemberships, groups } from "@/server/db/schema";
import {
  enqueueEventConfirmed,
  enqueueEventCancelled,
  enqueueEventRsvpReminder,
} from "@/server/jobs/email-jobs";

const EVENT_STATUSES = ["draft", "open", "confirmed", "cancelled"] as const;

async function assertMember(groupId: string, userId: string) {
  const m = await db.query.groupMemberships.findFirst({
    where: and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, userId)),
  });
  if (!m) throw new TRPCError({ code: "FORBIDDEN" });
  return m;
}

async function assertEventMember(eventId: string, userId: string) {
  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!event) throw new TRPCError({ code: "NOT_FOUND" });
  await assertMember(event.groupId, userId);
  return event;
}

export const eventsRouter = createTRPCRouter({
  // Create an event within a group (CAMP-060)
  create: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertMember(input.groupId, ctx.user.id);
      const id = createId();
      await db.insert(events).values({
        id,
        groupId: input.groupId,
        title: input.title,
        description: input.description ?? null,
        createdBy: ctx.user.id,
        status: "draft",
      });
      return { id };
    }),

  // List events for a group
  list: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertMember(input.groupId, ctx.user.id);
      return db.query.events.findMany({
        where: eq(events.groupId, input.groupId),
        with: {
          createdBy: { columns: { id: true, name: true, username: true } },
          rsvps: { columns: { userId: true, status: true } },
          polls: { columns: { id: true, type: true, question: true, status: true } },
        },
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
    }),

  // Get a single event with full detail
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const event = await db.query.events.findFirst({
        where: eq(events.id, input.id),
        with: {
          createdBy: { columns: { id: true, name: true, username: true, image: true } },
          rsvps: {
            with: { user: { columns: { id: true, name: true, username: true, image: true } } },
          },
          polls: {
            with: {
              options: {
                with: { votes: { columns: { userId: true } } },
                orderBy: (t, { asc }) => [asc(t.sortOrder)],
              },
            },
          },
        },
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(event.groupId, ctx.user.id);
      return event;
    }),

  // Update event status (open → confirmed / cancelled etc.) (CAMP-061)
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(EVENT_STATUSES),
        confirmedStartsAt: z.string().datetime().optional(),
        confirmedEndsAt: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const event = await assertEventMember(input.id, ctx.user.id);
      if (event.createdBy !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      const confirmedStartsAt = input.confirmedStartsAt
        ? new Date(input.confirmedStartsAt)
        : event.confirmedStartsAt;
      const confirmedEndsAt = input.confirmedEndsAt
        ? new Date(input.confirmedEndsAt)
        : event.confirmedEndsAt;

      await db
        .update(events)
        .set({
          status: input.status,
          confirmedStartsAt,
          confirmedEndsAt,
          updatedAt: new Date(),
        })
        .where(eq(events.id, input.id));

      // Fire email jobs for relevant status transitions
      if (input.status === "confirmed" || input.status === "cancelled") {
        const [rsvps, group] = await Promise.all([
          db.query.eventRsvps.findMany({
            where: eq(eventRsvps.eventId, input.id),
            columns: { userId: true, status: true },
          }),
          db.query.groups.findFirst({
            where: eq(groups.id, event.groupId),
            columns: { name: true },
          }),
        ]);

        const groupName = group?.name ?? "your group";
        const attendeeIds = rsvps
          .filter((r) => r.status === "yes" || r.status === "maybe")
          .map((r) => r.userId);

        if (input.status === "confirmed" && confirmedStartsAt) {
          void enqueueEventConfirmed({
            eventId: input.id,
            eventTitle: event.title,
            groupName,
            confirmedStartsAt: confirmedStartsAt.toISOString(),
            confirmedEndsAt: confirmedEndsAt?.toISOString() ?? null,
            recipientUserIds: attendeeIds,
          });

          // Schedule an RSVP reminder 24 h before the event for members who haven't RSVPd
          const allMembers = await db.query.groupMemberships.findMany({
            where: eq(groupMemberships.groupId, event.groupId),
            columns: { userId: true },
          });
          const rsvpdIds = new Set(rsvps.map((r) => r.userId));
          const unrsvpdIds = allMembers
            .map((m) => m.userId)
            .filter((id) => !rsvpdIds.has(id));

          const msUntilEvent = confirmedStartsAt.getTime() - Date.now();
          const reminderDelay = msUntilEvent - 24 * 60 * 60 * 1000;
          if (reminderDelay > 0 && unrsvpdIds.length > 0) {
            void enqueueEventRsvpReminder(
              { eventId: input.id, eventTitle: event.title, groupName, recipientUserIds: unrsvpdIds },
              reminderDelay
            );
          }
        }

        if (input.status === "cancelled") {
          void enqueueEventCancelled({
            eventId: input.id,
            eventTitle: event.title,
            groupName,
            recipientUserIds: attendeeIds,
          });
        }
      }

      return { id: input.id };
    }),

  // Upsert RSVP for the current user (CAMP-068)
  upsertRsvp: protectedProcedure
    .input(
      z.object({
        eventId: z.string(),
        status: z.enum(["yes", "no", "maybe"]),
        note: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const event = await assertEventMember(input.eventId, ctx.user.id);
      if (event.status === "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Event is cancelled." });
      }

      const existing = await db.query.eventRsvps.findFirst({
        where: and(
          eq(eventRsvps.eventId, input.eventId),
          eq(eventRsvps.userId, ctx.user.id)
        ),
      });

      if (existing) {
        await db
          .update(eventRsvps)
          .set({ status: input.status, note: input.note ?? null, updatedAt: new Date() })
          .where(and(eq(eventRsvps.eventId, input.eventId), eq(eventRsvps.userId, ctx.user.id)));
      } else {
        await db.insert(eventRsvps).values({
          eventId: input.eventId,
          userId: ctx.user.id,
          status: input.status,
          note: input.note ?? null,
        });
      }

      return { eventId: input.eventId, status: input.status };
    }),
});
