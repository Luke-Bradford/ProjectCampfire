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
 * On success: saves the Steam ID to the user record and redirects to settings.
 * On failure: redirects to settings with an error query param.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.redirect(new URL("/login", env.NEXT_PUBLIC_APP_URL));
  }

  const settingsUrl = new URL("/settings", env.NEXT_PUBLIC_APP_URL);
  const { searchParams } = req.nextUrl;

  // Steam sends back all openid.* params — re-send them to Steam for
  // direct verification by swapping mode to "check_authentication".
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
    settingsUrl.searchParams.set("steam_error", "Steam verification request failed");
    return NextResponse.redirect(settingsUrl);
  }

  const verifyText = await verifyRes.text();
  if (!verifyText.includes("is_valid:true")) {
    settingsUrl.searchParams.set("steam_error", "Steam verification failed");
    return NextResponse.redirect(settingsUrl);
  }

  // Extract the Steam ID from the claimed_id URL
  const claimedId = searchParams.get("openid.claimed_id") ?? "";
  const match = STEAM_ID_RE.exec(claimedId);
  if (!match) {
    settingsUrl.searchParams.set("steam_error", "Could not extract Steam ID");
    return NextResponse.redirect(settingsUrl);
  }

  const steamId = match[1]!;
  const steamProfileUrl = `https://steamcommunity.com/profiles/${steamId}`;

  // Check the Steam ID isn't already linked to a different account
  const existing = await db.query.user.findFirst({
    where: eq(user.steamId, steamId),
    columns: { id: true },
  });
  if (existing && existing.id !== session.user.id) {
    settingsUrl.searchParams.set("steam_error", "This Steam account is already linked to another user");
    return NextResponse.redirect(settingsUrl);
  }

  await db
    .update(user)
    .set({ steamId, steamProfileUrl })
    .where(eq(user.id, session.user.id));

  settingsUrl.searchParams.set("steam_linked", "1");
  return NextResponse.redirect(settingsUrl);
}
