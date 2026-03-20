import { z } from "zod";
import { and, eq, gte, inArray, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { events, eventRsvps, groupMemberships, groups, games, notifications } from "@/server/db/schema";
import {
  enqueueEventConfirmed,
  enqueueEventCancelled,
  enqueueEventRsvpReminder,
} from "@/server/jobs/email-jobs";
import { enqueuePush } from "@/server/jobs/push-jobs";
import { logger } from "@/lib/logger";

const log = logger.child("events");

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
        // Optional pre-filled time from the overlap view (CAMP-053).
        // Stored on the draft so the organiser can confirm it without retyping.
        confirmedStartsAt: z.string().datetime().optional(),
        confirmedEndsAt: z.string().datetime().optional(),
        // Optional game attachment (CAMP-193).
        gameId: z.string().optional(),
        gameOptional: z.boolean().default(false),
        // Optional location (CAMP-171).
        location: z.string().trim().max(500).optional(),
      }).refine(
        (d) => !d.confirmedStartsAt || !d.confirmedEndsAt || d.confirmedStartsAt < d.confirmedEndsAt,
        { message: "confirmedStartsAt must be before confirmedEndsAt" }
      )
    )
    .mutation(async ({ ctx, input }) => {
      await assertMember(input.groupId, ctx.user.id);

      // Reject new events in archived groups
      const group = await db.query.groups.findFirst({
        where: eq(groups.id, input.groupId),
        columns: { archivedAt: true },
      });
      if (group?.archivedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This group is archived." });
      }

      // Validate gameId exists if provided
      if (input.gameId) {
        const game = await db.query.games.findFirst({ where: eq(games.id, input.gameId) });
        if (!game) throw new TRPCError({ code: "BAD_REQUEST", message: "Game not found." });
      }

      const id = createId();
      await db.insert(events).values({
        id,
        groupId: input.groupId,
        title: input.title,
        description: input.description ?? null,
        createdBy: ctx.user.id,
        status: "draft",
        gameId: input.gameId ?? null,
        gameOptional: input.gameOptional,
        location: input.location ?? null,
        confirmedStartsAt: input.confirmedStartsAt ? new Date(input.confirmedStartsAt) : null,
        confirmedEndsAt: input.confirmedEndsAt ? new Date(input.confirmedEndsAt) : null,
      });
      return { id };
    }),

  // List events for a group.
  // rsvps is filtered to the caller's own RSVP only — prevents the "Going"
  // badge from showing when any other member has RSVPd yes (not the caller).
  // Sort: upcoming confirmed events first (soonest first), then TBD/drafts by creation time.
  list: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertMember(input.groupId, ctx.user.id);
      return db.query.events.findMany({
        where: eq(events.groupId, input.groupId),
        with: {
          createdBy: { columns: { id: true, name: true, username: true } },
          rsvps: {
            where: (rsvp, { eq: eqOp }) => eqOp(rsvp.userId, ctx.user.id),
            columns: { userId: true, status: true },
          },
          polls: { columns: { id: true, type: true, question: true, status: true } },
        },
        orderBy: (t, ops) => [
          // Confirmed events with a start time sort first (soonest first).
          // CASE expression pushes unconfirmed/TBD to the bottom.
          ops.sql`CASE WHEN ${t.status} = 'confirmed' AND ${t.confirmedStartsAt} IS NOT NULL THEN 0 ELSE 1 END`,
          ops.asc(t.confirmedStartsAt),
          ops.desc(t.createdAt),
        ],
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
          game: { columns: { id: true, title: true, coverUrl: true, steamAppId: true } },
          recurringTemplate: { columns: { id: true, title: true } },
          rsvps: {
            with: { user: { columns: { id: true, name: true, username: true, image: true } } },
          },
          polls: {
            with: {
              options: {
                with: {
                  votes: {
                    columns: { userId: true },
                    with: { user: { columns: { name: true, image: true } } },
                  },
                },
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
          // In-app + push notifications for attendees, excluding the creator (who triggered the action).
          // This is intentional: the creator already knows the event is confirmed.
          // Email notifications (above) also go to the full attendeeIds list; that is an existing
          // behaviour and unchanged here.
          const notifData = { eventId: input.id, eventTitle: event.title, groupName };
          const otherAttendees = attendeeIds.filter((id) => id !== ctx.user.id);
          if (otherAttendees.length > 0) {
            void db.insert(notifications)
              .values(otherAttendees.map((uid) => ({
                id: createId(),
                userId: uid,
                type: "event_confirmed" as const,
                data: notifData,
              })))
              .catch((err: unknown) => log.error("notification insert(event_confirmed) failed", { err: String(err) }));
            for (const uid of otherAttendees) {
              void enqueuePush(uid, {
                title: `Event confirmed: ${event.title}`,
                body: `"${event.title}" in ${groupName} has been confirmed.`,
                url: `/events/${input.id}`,
              }).catch(() => undefined);
            }
          }

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

          // T-24h reminder
          const reminder24hDelay = msUntilEvent - 24 * 60 * 60 * 1000;
          if (reminder24hDelay > 0 && unrsvpdIds.length > 0) {
            void enqueueEventRsvpReminder(
              { eventId: input.id, eventTitle: event.title, groupName, recipientUserIds: unrsvpdIds },
              reminder24hDelay
            );
          }

          // T-1h reminder (CAMP-129)
          const reminder1hDelay = msUntilEvent - 60 * 60 * 1000;
          if (reminder1hDelay > 0 && unrsvpdIds.length > 0) {
            void enqueueEventRsvpReminder(
              { eventId: input.id, eventTitle: event.title, groupName, recipientUserIds: unrsvpdIds },
              reminder1hDelay
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
          const notifDataCancel = { eventId: input.id, eventTitle: event.title, groupName };
          const otherAttendeesCancel = attendeeIds.filter((id) => id !== ctx.user.id);
          if (otherAttendeesCancel.length > 0) {
            void db.insert(notifications)
              .values(otherAttendeesCancel.map((uid) => ({
                id: createId(),
                userId: uid,
                type: "event_cancelled" as const,
                data: notifDataCancel,
              })))
              .catch((err: unknown) => log.error("notification insert(event_cancelled) failed", { err: String(err) }));
            for (const uid of otherAttendeesCancel) {
              void enqueuePush(uid, {
                title: `Event cancelled: ${event.title}`,
                body: `"${event.title}" in ${groupName} has been cancelled.`,
                url: `/events/${input.id}`,
              }).catch(() => undefined);
            }
          }
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

  // Edit event title / description (organiser only) (CAMP-170)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().max(2000).nullable().optional(),
        location: z.string().trim().max(500).nullable().optional(),
      }).refine(
        (d) => d.title !== undefined || d.description !== undefined || d.location !== undefined,
        { message: "At least one field must be provided." }
      )
    )
    .mutation(async ({ ctx, input }) => {
      const event = await assertEventMember(input.id, ctx.user.id);
      if (event.createdBy !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (event.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot edit a cancelled event." });

      await db
        .update(events)
        .set({
          ...(input.title !== undefined && { title: input.title }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.location !== undefined && { location: input.location }),
          updatedAt: new Date(),
        })
        .where(eq(events.id, input.id));

      return { id: input.id };
    }),

  // Attach or update the game on an event (organiser only) (CAMP-193)
  attachGame: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        gameId: z.string(),
        gameOptional: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const event = await assertEventMember(input.id, ctx.user.id);
      if (event.createdBy !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (event.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "Event is cancelled." });

      const game = await db.query.games.findFirst({ where: eq(games.id, input.gameId) });
      if (!game) throw new TRPCError({ code: "BAD_REQUEST", message: "Game not found." });

      await db.update(events).set({ gameId: input.gameId, gameOptional: input.gameOptional, updatedAt: new Date() }).where(eq(events.id, input.id));
      return { id: input.id };
    }),

  // Remove the attached game from an event (organiser only) (CAMP-193)
  detachGame: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const event = await assertEventMember(input.id, ctx.user.id);
      if (event.createdBy !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (event.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "Event is cancelled." });

      await db.update(events).set({ gameId: null, gameOptional: false, updatedAt: new Date() }).where(eq(events.id, input.id));
      return { id: input.id };
    }),

  // Next N upcoming events across all the user's groups (for feed sidebar panel)
  /**
   * Returns the single next upcoming event for a group, with RSVP counts and
   * the caller's own RSVP. Counts are computed server-side with SQL — no
   * individual RSVP rows are returned to the client.
   */
  nextForGroup: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertMember(input.groupId, ctx.user.id);

      const now = new Date();

      // Find the next upcoming event
      const event = await db.query.events.findFirst({
        where: and(
          eq(events.groupId, input.groupId),
          or(
            and(eq(events.status, "confirmed"), gte(events.confirmedStartsAt, now)),
            eq(events.status, "open"),
            eq(events.status, "draft")
          )
        ),
        columns: { id: true, title: true, status: true, confirmedStartsAt: true },
        orderBy: (t, { asc, desc, sql: sqlFn }) => [
          sqlFn`CASE WHEN ${t.status} = 'confirmed' AND ${t.confirmedStartsAt} IS NOT NULL THEN 0 ELSE 1 END`,
          asc(t.confirmedStartsAt),
          desc(t.createdAt),
        ],
      });

      if (!event) return null;

      // Compute RSVP counts server-side — only aggregates are returned, never individual rows
      const [counts, myRsvpRow] = await Promise.all([
        db
          .select({
            going: sql<number>`count(*) filter (where ${eventRsvps.status} = 'yes')`,
            maybe: sql<number>`count(*) filter (where ${eventRsvps.status} = 'maybe')`,
          })
          .from(eventRsvps)
          .where(eq(eventRsvps.eventId, event.id))
          .then((r) => r[0] ?? { going: 0, maybe: 0 }),
        db.query.eventRsvps.findFirst({
          where: and(eq(eventRsvps.eventId, event.id), eq(eventRsvps.userId, ctx.user.id)),
          columns: { status: true },
        }),
      ]);

      return {
        id: event.id,
        title: event.title,
        status: event.status,
        confirmedStartsAt: event.confirmedStartsAt,
        goingCount: Number(counts.going),
        maybeCount: Number(counts.maybe),
        myRsvp: myRsvpRow?.status ?? null,
      };
    }),

  upcoming: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(10).default(3) }))
    .query(async ({ ctx, input }) => {
      // Find all groups the user is a member of
      const memberships = await db.query.groupMemberships.findMany({
        where: eq(groupMemberships.userId, ctx.user.id),
        columns: { groupId: true },
      });
      if (memberships.length === 0) return [];

      const groupIds = memberships.map((m) => m.groupId);
      const now = new Date();

      // Show confirmed future events + open/draft events (TBD — no confirmed time yet).
      // Confirmed events sort first (soonest first); open/draft events follow by creation date.
      return db.query.events.findMany({
        where: and(
          inArray(events.groupId, groupIds),
          or(
            // Confirmed with a future start time
            and(eq(events.status, "confirmed"), gte(events.confirmedStartsAt, now)),
            // Open or draft — no confirmed time yet, still relevant
            eq(events.status, "open"),
            eq(events.status, "draft")
          )
        ),
        with: {
          group: { columns: { id: true, name: true } },
          rsvps: {
            where: (rsvp, { eq: eqOp }) => eqOp(rsvp.userId, ctx.user.id),
            columns: { status: true },
          },
        },
        // Confirmed events (with a time) sort first; open/draft events after, by creation date
        orderBy: (t, { asc, sql }) => [
          sql`CASE WHEN ${t.status} = 'confirmed' AND ${t.confirmedStartsAt} IS NOT NULL THEN 0 ELSE 1 END`,
          asc(t.confirmedStartsAt),
          asc(t.createdAt),
        ],
        limit: input.limit,
      });
    }),
});
