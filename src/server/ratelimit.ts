import { TRPCError } from "@trpc/server";
import { redis } from "@/server/redis";

/**
 * Fixed-window rate limiter backed by Redis.
 *
 * Uses INCR + EXPIRE on every request. EXPIRE is called unconditionally (not
 * only on count === 1) to eliminate the race where the process crashes between
 * INCR and EXPIRE, which would leave the key without a TTL and permanently
 * block that user/IP. Re-setting the TTL on each request slightly extends the
 * window on sustained traffic, which makes the limit more lenient — acceptable
 * for abuse protection.
 *
 * @param key           Unique key for this limit (e.g. `rl:search:userId`)
 * @param limit         Max requests allowed in the window
 * @param windowSeconds Window duration in seconds
 * @returns true if the request is allowed, false if it is over-limit
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const count = await redis.incr(key);
  await redis.expire(key, windowSeconds);
  return count <= limit;
}

/**
 * Convenience wrapper that throws a tRPC TOO_MANY_REQUESTS error when the
 * limit is exceeded. Use inside tRPC procedure bodies.
 */
export async function assertRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const allowed = await checkRateLimit(key, limit, windowSeconds);
  if (!allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please slow down and try again.",
    });
  }
}
