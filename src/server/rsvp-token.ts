/**
 * Stateless signed RSVP tokens for one-click RSVP from email links.
 *
 * Token format (dot-separated, URL-safe base64):
 *   <eventId>.<userId>.<status>.<expiresEpochSeconds>.<hmac>
 *
 * HMAC-SHA256 over AUTH_SECRET covering the first four segments to prevent
 * forgery. Expiry is enforced on verification.
 *
 * No database table required — tokens are self-contained.
 */

import { createHmac } from "crypto";
import { env } from "@/env";

export type RsvpTokenPayload = {
  eventId: string;
  userId: string;
  status: "yes" | "no" | "maybe";
  expiresAt: number; // epoch seconds
};

const SEP = ".";

function b64url(s: string): string {
  return Buffer.from(s).toString("base64url");
}

function fromB64url(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

function hmac(message: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(message).digest("base64url");
}

/**
 * Create a signed RSVP token valid for `ttlSeconds` (default 7 days).
 */
export function createRsvpToken(
  payload: Omit<RsvpTokenPayload, "expiresAt">,
  ttlSeconds = 7 * 24 * 60 * 60
): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const parts = [
    b64url(payload.eventId),
    b64url(payload.userId),
    b64url(payload.status),
    String(expires),
  ];
  const message = parts.join(SEP);
  const sig = hmac(message);
  return `${message}${SEP}${sig}`;
}

/**
 * Verify and decode a signed RSVP token.
 * Returns the payload on success, or null if invalid/expired/tampered.
 */
export function verifyRsvpToken(token: string): RsvpTokenPayload | null {
  const segments = token.split(SEP);
  if (segments.length !== 5) return null;

  const [rawEventId, rawUserId, rawStatus, rawExpires, sig] = segments as [
    string, string, string, string, string
  ];

  // Verify signature
  const message = segments.slice(0, 4).join(SEP);
  const expectedSig = hmac(message);
  if (sig !== expectedSig) return null;

  // Check expiry
  const expires = Number(rawExpires);
  if (!Number.isFinite(expires) || Math.floor(Date.now() / 1000) > expires) return null;

  // Decode fields
  const eventId = fromB64url(rawEventId);
  const userId = fromB64url(rawUserId);
  const status = fromB64url(rawStatus);

  if (!eventId || !userId) return null;
  if (status !== "yes" && status !== "no" && status !== "maybe") return null;

  return { eventId, userId, status, expiresAt: expires };
}
