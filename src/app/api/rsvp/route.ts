/**
 * POST /api/rsvp
 *
 * Accepts a signed RSVP token from an email link and upserts the RSVP without
 * requiring the user to be logged in. The token encodes eventId, userId, status,
 * and an expiry — signed with AUTH_SECRET to prevent forgery.
 *
 * Body: { token: string }
 * Response: { ok: true, eventId: string, status: string } | { error: string }
 */

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { events, eventRsvps, groupMemberships } from "@/server/db/schema";
import { verifyRsvpToken } from "@/server/rsvp-token";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || typeof (body as Record<string, unknown>).token !== "string") {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const token = (body as Record<string, unknown>).token as string;
  const payload = verifyRsvpToken(token);

  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired RSVP link." }, { status: 400 });
  }

  const { eventId, userId, status } = payload;

  // Confirm the event exists and is not cancelled
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: { id: true, groupId: true, status: true },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }
  if (event.status === "cancelled") {
    return NextResponse.json({ error: "This event has been cancelled." }, { status: 409 });
  }

  // Confirm the user is still a member of the event's group
  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, event.groupId),
      eq(groupMemberships.userId, userId)
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "You are no longer a member of this group." }, { status: 403 });
  }

  // Upsert RSVP
  const existing = await db.query.eventRsvps.findFirst({
    where: and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId)),
  });

  if (existing) {
    await db
      .update(eventRsvps)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId)));
  } else {
    await db.insert(eventRsvps).values({ eventId, userId, status });
  }

  return NextResponse.json({ ok: true, eventId, status });
}
