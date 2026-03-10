import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { redis } from "@/server/redis";

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
    db.execute(sql`SELECT 1`).then(() => { checks.db = "ok"; }).catch(() => {}),
    redis.ping().then(() => { checks.redis = "ok"; }).catch(() => {}),
  ]);

  const ok = checks.db === "ok" && checks.redis === "ok";
  const body: HealthResponse = { status: ok ? "ok" : "error", checks };

  return Response.json(body, { status: ok ? 200 : 503 });
}
