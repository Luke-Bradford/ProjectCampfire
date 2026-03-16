import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { env } from "@/env";
import { headers } from "next/headers";

/**
 * GET /api/steam/connect
 *
 * Initiates a Steam OpenID 2.0 authentication flow.
 * The user must be logged in — this links Steam to an existing account,
 * it does not register a new one.
 *
 * Optional query param: `return_to` — an internal path to redirect to after
 * linking. If omitted, the callback defaults to /settings. Must be a relative
 * path (validated in the callback to prevent open-redirect attacks).
 *
 * Redirects the browser to the Steam login page with a return URL pointing
 * to /api/steam/callback.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.redirect(new URL("/login", env.NEXT_PUBLIC_APP_URL));
  }

  // Pass an optional return_to through the callback.
  // Validate here (defence-in-depth): extract only the pathname from user input,
  // discarding any query/hash so the callback receives a clean relative path.
  const returnToRaw = req.nextUrl.searchParams.get("return_to") ?? "";
  const callbackUrl = new URL(`${env.NEXT_PUBLIC_APP_URL}/api/steam/callback`);
  if (returnToRaw) {
    try {
      // Resolve against app origin so relative paths work; then take only pathname.
      const resolved = new URL(returnToRaw, env.NEXT_PUBLIC_APP_URL);
      // Only accept paths that belong to our own origin.
      if (resolved.origin === env.NEXT_PUBLIC_APP_URL) {
        callbackUrl.searchParams.set("return_to", resolved.pathname);
      }
    } catch {
      // Malformed URL — ignore; callback will fall back to /settings.
    }
  }

  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": callbackUrl.toString(),
    "openid.realm": env.NEXT_PUBLIC_APP_URL,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });

  const steamLoginUrl = `https://steamcommunity.com/openid/login?${params.toString()}`;
  return NextResponse.redirect(steamLoginUrl);
}
