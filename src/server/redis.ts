import IORedis from "ioredis";
import { env } from "@/env";

// General-purpose Redis client (e.g., for caching / session invalidation)
export const redis = new IORedis(env.REDIS_URL);

// Plain connection options for BullMQ.
// BullMQ pins its own ioredis version, so passing an IORedis instance causes
// a TypeScript type mismatch. Passing a plain options object avoids that.
function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: parseInt(parsed.pathname.slice(1) || "0", 10),
  };
}

export const bullmqConnection = {
  ...parseRedisUrl(env.REDIS_URL),
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
};
