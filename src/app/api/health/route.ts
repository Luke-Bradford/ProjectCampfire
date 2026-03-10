import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { redis } from "@/server/redis";

// Always run live — never statically rendered or cached.
export const dynamic = "force-dynamic";

const CHECK_TIMEOUT_MS = 5_000;

/** Races a promise against a timeout; resolves to undefined on timeout. */
function withTimeout<T>(p: Promise<T>): Promise<T | undefined> {
  return Promise.race([
    p,
    new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), CHECK_TIMEOUT_MS)
    ),
  ]);
}

type CheckResult = "ok" | "error";

interface HealthResponse {
  status: "ok" | "error";
  checks: {
    db: CheckResult;
    redis: CheckResult;
  };
}

export async function GET(): Promise<Response> {
  const checks: HealthResponse["checks"] = {
    db: "error",
    redis: "error",
  };

  await Promise.all([
    withTimeout(db.execute(sql`SELECT 1`))
      .then((r) => { if (r !== undefined) checks.db = "ok"; })
      .catch(() => {}),
    withTimeout(redis.ping())
      .then((r) => { if (r !== undefined) checks.redis = "ok"; })
      .catch(() => {}),
  ]);

  const ok = checks.db === "ok" && checks.redis === "ok";
  const body: HealthResponse = { status: ok ? "ok" : "error", checks };

  return Response.json(body, { status: ok ? 200 : 503 });
}
