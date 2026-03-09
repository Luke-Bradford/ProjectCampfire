import { NextResponse, type NextRequest } from "next/server";

// Registration rate limit: 5 attempts per 15 minutes per IP.
// Key: rl:register:<ip> — expires after REGISTER_WINDOW seconds.
//
// Middleware runs in Node.js runtime by default (no `export const runtime = "edge"`),
// so IORedis is supported. checkRateLimit is imported dynamically to avoid
// build-time module resolution issues with the Next.js bundler.
const REGISTER_LIMIT = 5;
const REGISTER_WINDOW = 15 * 60; // 15 minutes in seconds

export async function middleware(request: NextRequest) {
  // Only apply to the better-auth registration endpoint
  if (
    request.method === "POST" &&
    request.nextUrl.pathname === "/api/auth/sign-up/email"
  ) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    const { checkRateLimit } = await import("@/server/ratelimit");
    const allowed = await checkRateLimit(`rl:register:${ip}`, REGISTER_LIMIT, REGISTER_WINDOW);

    if (!allowed) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429 },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/sign-up/email"],
};
