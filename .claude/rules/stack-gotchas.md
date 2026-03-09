---
paths:
  - "src/server/**/*.ts"
  - "src/worker/**/*.ts"
  - "src/app/api/**/*.ts"
  - "src/env.ts"
---

# Stack-Specific Gotchas

Loaded when editing backend, worker, or API files.

## Postgres
- Array index assignment on a NULL or empty column: works on Postgres 16 —
  extends the array with NULLs. Verify empirically if unsure; do not assert.
- Arrays are 1-based in Postgres. JavaScript is 0-based. Always convert explicitly.
- Use `${tableObject}` in `sql` templates, never the string table name.
- `sql.raw()` is banned for any runtime value — use parameterised `sql` tags.

## Next.js App Router
- `export const config = { api: { bodyParser: ... } }` is Pages Router only.
  It is silently ignored in App Router route handlers. Do not add it.
- App Router fetch handlers have no Next.js-imposed body size limit.
  Body size is constrained by: Zod validation + reverse proxy config.
- Route segment config (`export const dynamic`, `export const runtime`) applies
  to App Router but is different from the Pages `config` export.

## tRPC / BullMQ
- `protectedProcedure` = authenticated. It does NOT = owns the resource.
  Always add a separate ownership check for mutations on user-owned data.
- BullMQ job payloads are read from Redis. Even if the tRPC layer validated
  the input, the worker must not trust `job.data` values blindly. Validate
  or sanitise at the worker boundary for anything used in SQL/file paths.
- Use `bullmqConnection` (plain options object from `src/server/redis.ts`).
  Never pass an IORedis instance directly.

## MinIO
- `endPoint` in the MinIO `Client` constructor is hostname only — no port, no protocol.
- Port goes in the `port` option. SSL goes in `useSSL`.
- `MINIO_ENDPOINT` + `MINIO_PORT` are the two separate env vars for this project.

## Environment
- `src/env.ts` uses Zod v4 + @t3-oss/env-nextjs. App crashes on startup if any
  required var is missing. Add new vars to both `server`/`client` schema and `runtimeEnv`.
