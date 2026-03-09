import { NextResponse, type NextRequest } from "next/server";

// Registration rate limit: 5 attempts per 15 minutes per IP.
// Implemented with a simple in-memory sliding window using Response headers
// is insufficient for a distributed setup. We use a Redis-backed counter
// via a fetch call is not possible inside Edge middleware. Instead, we
// use the Node.js runtime (middleware runs in Node.js by default in App Router
// when not explicitly set to "edge") — the redis import works here.
//
// Key: rl:register:<ip>  — incremented per attempt, expires after 15 min.
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

    // Dynamically import redis to avoid issues with Edge runtime detection.
    // This middleware uses Node.js runtime (no `export const runtime = "edge"`).
    const { redis } = await import("@/server/redis");

    const key = `rl:register:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, REGISTER_WINDOW);
    }

    if (count > REGISTER_LIMIT) {
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
