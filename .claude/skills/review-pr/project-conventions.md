# ProjectCampfire — Known Patterns & Intentional Decisions

This file documents patterns the reviewer should recognise as intentional.

## Auth & authorisation
- **better-auth** is the auth library (not Lucia, not NextAuth).
- `user` table is singular (not `users`). This is the better-auth convention.
- Session row uses `token` field (not `sessionToken`).
- `protectedProcedure` in `src/server/trpc/trpc.ts` enforces authentication only.
  Ownership of a specific resource must always be checked separately.

## Database
- Drizzle ORM. Schema in `src/server/db/schema/`.
- All profile fields live on the `user` table (no separate profile table).
- IDs are cuid2 strings, not integers or UUIDs.
- Migrations are in `drizzle/` which is gitignored. Generated locally with
  `pnpm db:generate`, applied at deploy with `pnpm db:migrate`.
- `username: null` in a unique column is intentional — Postgres unique indexes
  allow multiple NULLs; this lets accounts exist before a username is set.
- `sql.raw()` is never used with runtime values. Parameterised `sql` tags only.

## Background jobs (BullMQ)
- `bullmqConnection` is a plain options object from `src/server/redis.ts`.
  IORedis instance is never passed directly to BullMQ constructors.
- Job queues are defined in `src/server/jobs/` and imported by the worker.
- Fire-and-forget enqueue (`.catch(console.error)`) is the intentional pattern
  for non-critical background work. A sweeper or recovery mechanism is documented
  where applicable.

## MinIO / storage
- `MINIO_ENDPOINT` is hostname only (e.g. `localhost`). Port is `MINIO_PORT`.
  This is a deliberate split to match the MinIO Client constructor signature.
- `storageUrl()` in `src/server/storage.ts` builds the public URL from both vars.

## Next.js App Router
- `export const config = { api: { bodyParser: ... } }` is Pages Router only.
  It is silently ignored in App Router route handlers. Do not flag its absence.
- App Router route handlers using the fetch adapter have no Next.js-imposed
  body size limit. Body size is controlled by Zod validation + reverse proxy config.

## Soft delete
- Accounts: `deletedAt` timestamp + async PII scrub job via BullMQ.
  The hourly sweeper re-enqueues lost scrub jobs. This is documented in the
  account deletion flow as a conscious fire-and-forget with recovery.
- Posts/comments: `deletedAt` timestamp, not hard delete.

## Image uploads
- Raw files stored in MinIO immediately; processing (Sharp resize → webp) runs
  in a background worker. The processed URL is written back to the DB by the worker.
- `posts.imageUrls` is initialised to `[]` at insert so the column is never NULL.
  Postgres array index assignment on a NULL column is safe on Postgres 16 (extends
  with NULLs), but explicit init is better practice.
- Absolute URLs are stored in the DB (known tradeoff, acceptable at MVP scale).

## Lint / typecheck
- `eslint src --max-warnings 0` — zero warnings allowed. `next lint` is deprecated.
- `pnpm typecheck` — `tsc --noEmit`. Must pass before any commit.
