/**
 * /rsvp?token=<signed-token>
 *
 * One-click RSVP landing page. Validates the signed token server-side,
 * upserts the RSVP, and renders a confirmation — no login required.
 */

import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { events, eventRsvps, groupMemberships } from "@/server/db/schema";
import { verifyRsvpToken } from "@/server/rsvp-token";

const STATUS_LABEL: Record<string, string> = {
  yes: "Going",
  no: "Not going",
  maybe: "Maybe",
};

const STATUS_COLOR: Record<string, string> = {
  yes: "#16a34a",
  no: "#dc2626",
  maybe: "#ca8a04",
};

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export default async function RsvpPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token) {
    return <RsvpError message="Missing RSVP token." />;
  }

  const payload = verifyRsvpToken(token);
  if (!payload) {
    return <RsvpError message="This RSVP link is invalid or has expired." />;
  }

  const { eventId, userId, status } = payload;

  // Verify event exists and is not cancelled
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: { id: true, groupId: true, status: true, title: true },
  });

  if (!event) {
    return <RsvpError message="Event not found." />;
  }
  if (event.status === "cancelled") {
    return <RsvpError message="This event has been cancelled." />;
  }

  // Verify user is still a group member
  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, event.groupId),
      eq(groupMemberships.userId, userId)
    ),
  });

  if (!membership) {
    return <RsvpError message="You are no longer a member of this group." />;
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full rounded-xl border bg-card p-8 text-center shadow-sm space-y-4">
        <div
          className="inline-flex h-14 w-14 items-center justify-center rounded-full text-white text-2xl mx-auto"
          style={{ backgroundColor: STATUS_COLOR[status] ?? "#6b7280" }}
          aria-hidden="true"
        >
          {status === "yes" ? "✓" : status === "no" ? "✗" : "~"}
        </div>
        <div>
          <p className="text-lg font-semibold">
            {STATUS_LABEL[status] ?? status}
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            Your RSVP for <strong>{event.title}</strong> has been recorded.
          </p>
        </div>
        <Link
          href={`/events/${eventId}`}
          className="inline-block mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          View event
        </Link>
      </div>
    </div>
  );
}

function RsvpError({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full rounded-xl border bg-card p-8 text-center shadow-sm space-y-3">
        <p className="text-lg font-semibold text-destructive">RSVP failed</p>
        <p className="text-muted-foreground text-sm">{message}</p>
        <Link
          href="/"
          className="inline-block mt-2 text-sm text-primary hover:underline"
        >
          Go to Campfire
        </Link>
      </div>
    </div>
  );
}
