import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { env } from "@/env";
import { headers } from "next/headers";

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
// Steam64 IDs are in this range: 76561197960265728 – 76561202255233023
const STEAM_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;


/**
 * GET /api/steam/callback
 *
 * Receives the Steam OpenID redirect and verifies the response with Steam's
 * endpoint (direct verification, no library needed).
 *
 * Security: validates openid.return_to before verification (OpenID 2.0 spec
 * section 11.1) to prevent replay attacks from other relying parties.
 *
 * On success: saves the Steam ID to the user record and redirects to settings.
 * On failure: redirects to settings with a fixed-set error code.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.redirect(new URL("/login", env.NEXT_PUBLIC_APP_URL));
  }

  const { searchParams } = req.nextUrl;

  // Resolve the post-link redirect destination.
  // Parse with URL to normalise encoding, then accept only the pathname so
  // no attacker-controlled query params or fragments flow into the success URL.
  // Fall back to /settings if absent, malformed, or from a different origin.
  const returnToParam = searchParams.get("return_to") ?? "";
  let postLinkPathname = "/settings";
  if (returnToParam) {
    try {
      const resolved = new URL(returnToParam, env.NEXT_PUBLIC_APP_URL);
      if (resolved.origin === env.NEXT_PUBLIC_APP_URL) {
        postLinkPathname = resolved.pathname;
      }
    } catch {
      // Malformed — fall back to /settings.
    }
  }
  const postLinkUrl = new URL(postLinkPathname, env.NEXT_PUBLIC_APP_URL);

  // Default error redirect is always /settings to avoid leaking error codes to caller-controlled URLs
  const settingsUrl = new URL("/settings", env.NEXT_PUBLIC_APP_URL);

  function fail(code: string) {
    settingsUrl.searchParams.set("steam_error", code);
    return NextResponse.redirect(settingsUrl);
  }

  // ── OpenID 2.0 spec §11.1: verify return_to matches our expected callback ──
  // Steam's check_authentication only verifies the signature, not which RP it
  // was issued to. Without this check, a signed response from a different
  // relying party could be replayed here.
  const expectedReturnTo = `${env.NEXT_PUBLIC_APP_URL}/api/steam/callback`;
  const returnTo = searchParams.get("openid.return_to") ?? "";
  if (!returnTo.startsWith(expectedReturnTo)) {
    return fail("invalid_return_to");
  }

  // Re-send all openid.* params to Steam for direct verification, swapping
  // mode to "check_authentication".
  const verifyParams = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    verifyParams.set(key, value);
  }
  verifyParams.set("openid.mode", "check_authentication");

  let verifyRes: Response;
  try {
    verifyRes = await fetch(STEAM_OPENID_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: verifyParams.toString(),
    });
  } catch {
    return fail("verification_request_failed");
  }

  // Steam response is key:value, one per line. Use line-based check to avoid
  // false positives from a field value that happens to contain "is_valid:true".
  const verifyLines = (await verifyRes.text()).split("\n").map((l) => l.trim());
  if (!verifyLines.includes("is_valid:true")) {
    return fail("verification_failed");
  }

  // Extract the Steam ID from the claimed_id URL
  const claimedId = searchParams.get("openid.claimed_id") ?? "";
  const match = STEAM_ID_RE.exec(claimedId);
  if (!match) {
    return fail("invalid_steam_id");
  }

  const steamId = match[1]!;
  const steamProfileUrl = `https://steamcommunity.com/profiles/${steamId}`;

  // Check the Steam ID isn't already linked to a different account
  const existing = await db.query.user.findFirst({
    where: eq(user.steamId, steamId),
    columns: { id: true },
  });
  if (existing && existing.id !== session.user.id) {
    return fail("already_linked");
  }

  await db
    .update(user)
    .set({ steamId, steamProfileUrl })
    .where(eq(user.id, session.user.id));

  postLinkUrl.searchParams.set("steam_linked", "1");
  return NextResponse.redirect(postLinkUrl);
}
