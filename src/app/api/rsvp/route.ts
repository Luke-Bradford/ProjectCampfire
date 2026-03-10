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
import { executeRsvpFromToken } from "@/server/rsvp-from-token";

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
  const result = await executeRsvpFromToken(token);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus });
  }

  return NextResponse.json({ ok: true, eventId: result.eventId, status: result.status });
}
