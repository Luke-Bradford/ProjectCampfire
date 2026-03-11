import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

// Reuse the postgres client across hot-reloads in development.
// Without this, each HMR cycle creates a new connection pool, exhausting the
// previous one and causing session/query errors until the old pool times out.
// In production the module is only ever evaluated once, so the guard is a no-op.
const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

const client = globalForDb.pgClient ?? postgres(env.DATABASE_URL);

if (env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
