import { TRPCError } from "@trpc/server";
import { redis } from "@/server/redis";

/**
 * Sliding fixed-window rate limiter backed by Redis.
 *
 * Uses INCR + EXPIRE: the counter key expires after `windowSeconds`, so each
 * window resets cleanly. Not a true sliding window but is sufficient for MVP
 * abuse protection and produces zero false positives on normal usage.
 *
 * @param key     Unique key for this limit (e.g. `rl:search:userId`)
 * @param limit   Max requests allowed in the window
 * @param windowSeconds  Window duration in seconds
 * @returns true if the request is allowed, false if it is over-limit
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const count = await redis.incr(key);
  if (count === 1) {
    // First request in this window — set the expiry
    await redis.expire(key, windowSeconds);
  }
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
