import { NextResponse } from "next/server";

// Next.js middleware always runs on the Edge runtime, which does not support
// Node.js APIs (ioredis, net, tls, etc.). Rate limiting for registration is
// therefore handled in Node.js route handlers, not here.
//
// Kept as a placeholder for future Edge-compatible middleware
// (e.g. geo-blocking, basic header manipulation).

export function middleware() {
  return NextResponse.next();
}

export const config = {
  // No routes matched — middleware is effectively disabled until needed.
  matcher: [],
};
