import { NextResponse } from "next/server";
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
 * Redirects the browser to the Steam login page with a return URL pointing
 * to /api/steam/callback.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.redirect(new URL("/login", env.NEXT_PUBLIC_APP_URL));
  }

  const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}/api/steam/callback`;

  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": callbackUrl,
    "openid.realm": env.NEXT_PUBLIC_APP_URL,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });

  const steamLoginUrl = `https://steamcommunity.com/openid/login?${params.toString()}`;
  return NextResponse.redirect(steamLoginUrl);
}
