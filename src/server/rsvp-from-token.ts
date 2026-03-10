/**
 * Shared logic for executing an RSVP from a signed email token.
 *
 * Used by both POST /api/rsvp (client-triggered) and the /rsvp page (server action).
 * Validates the token, checks event state and group membership, then atomically
 * upserts the RSVP using INSERT … ON CONFLICT DO UPDATE.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { events, eventRsvps, groupMemberships } from "@/server/db/schema";
import { verifyRsvpToken } from "@/server/rsvp-token";

export type RsvpResult =
  | { ok: true; eventId: string; eventTitle: string; status: "yes" | "no" | "maybe" }
  | { ok: false; error: string; httpStatus: number };

export async function executeRsvpFromToken(token: string): Promise<RsvpResult> {
  const payload = verifyRsvpToken(token);
  if (!payload) {
    return { ok: false, error: "Invalid or expired RSVP link.", httpStatus: 400 };
  }

  const { eventId, userId, status } = payload;

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: { id: true, groupId: true, status: true, title: true },
  });

  if (!event) {
    return { ok: false, error: "Event not found.", httpStatus: 404 };
  }
  if (event.status === "cancelled") {
    return { ok: false, error: "This event has been cancelled.", httpStatus: 409 };
  }

  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, event.groupId),
      eq(groupMemberships.userId, userId)
    ),
  });

  if (!membership) {
    return { ok: false, error: "You are no longer a member of this group.", httpStatus: 403 };
  }

  // Atomic upsert — avoids TOCTOU race when concurrent requests arrive for
  // the same (eventId, userId), e.g. the user clicking two buttons quickly.
  await db
    .insert(eventRsvps)
    .values({ eventId, userId, status })
    .onConflictDoUpdate({
      target: [eventRsvps.eventId, eventRsvps.userId],
      set: { status, updatedAt: new Date() },
    });

  return { ok: true, eventId, eventTitle: event.title, status };
}
