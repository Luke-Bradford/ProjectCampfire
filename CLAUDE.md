# ProjectCampfire

Gaming social + session planning app. Self-hosted, Docker Compose, TypeScript monorepo.

## Quick Start

```bash
pnpm install
cp .env.example .env        # fill in values
docker compose up -d         # postgres, redis, minio, mailhog
pnpm db:generate && pnpm db:migrate
pnpm dev                     # Next.js on :3000
pnpm worker                  # BullMQ worker (separate terminal)
```

## Stack

Next.js 15 (App Router) · tRPC v11 · Drizzle ORM · PostgreSQL 16 · Redis (Valkey) · **better-auth** · BullMQ · MinIO · Sharp · Nodemailer · shadcn/ui · Tailwind CSS v3

## Work Tracking

**Source of truth: [GitHub Issues](https://github.com/Luke-Bradford/ProjectCampfire/issues)** with milestones per phase.

- Stories use `CAMP-XXX` IDs (e.g. `CAMP-001`)
- Milestones: Phase 0 (Foundation) → Phase 1 (Planning Loop) → Phase 2 (Enrichment) → Phase 3 (Polish)
- Labels: `epic:auth`, `epic:friends`, `epic:groups`, `epic:feed`, `epic:planning`, `epic:games`, `epic:availability`, `epic:notifications`, `epic:onboarding`, `epic:infra`, `tech-debt`
- To find next work: `gh issue list --milestone "Phase 0 — Foundation" --state open`

## Key Conventions

- **Auth:** better-auth (not Lucia). User table is `user` (singular). Session uses `token` field.
- **Schema:** All custom profile fields live on the `user` table. See `src/server/db/schema/auth.ts`.
- **BullMQ:** Export `bullmqConnection` as a plain options object from `src/server/redis.ts`. Do NOT pass an IORedis instance to BullMQ (version conflict).
- **Lint:** Use `eslint src --max-warnings 0` directly (`next lint` is deprecated in Next.js 15).
- **Env validation:** `src/env.ts` uses `@t3-oss/env-nextjs` with Zod v4. App crashes on startup if variables are missing.

## Project Layout

```
src/
  app/                          # Next.js App Router pages
    (app)/                      # Authenticated layout group
      feed/, friends/, groups/, events/, games/, availability/, settings/, notifications/
    (auth)/                     # Auth pages (login, register, forgot-password)
    (onboarding)/               # First-run flow
    api/auth/[...all]/          # better-auth handler
    api/trpc/[trpc]/            # tRPC handler
  server/
    auth/index.ts               # better-auth instance
    db/schema/                  # Drizzle schema (auth, posts, friendships, groups, games, events, availability)
    redis.ts                    # IORedis + bullmqConnection
    trpc/
      trpc.ts                   # tRPC init + auth middleware
      routers/_app.ts           # Root router
      routers/*.ts              # user, friends, groups, feed, notifications, events, games, availability, polls
  worker/index.ts               # BullMQ workers (email, image-processing, og-fetch)
  components/ui/                # shadcn/ui components
  lib/auth-client.ts            # better-auth client
  trpc/react.tsx                # tRPC React provider
  trpc/server.ts                # tRPC server-side caller (RSC)
  env.ts                        # Environment validation
docs/
  PRODUCT_BRIEF.md              # Functional spec (what the product does)
  ARCHITECTURE.md               # Tech spec (how it's built)
  DOMAIN_MODEL.md               # Data model reference
  ROADMAP.md                    # Phase overview
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm worker` | BullMQ worker process |
| `pnpm db:generate` | Drizzle Kit generate migration |
| `pnpm db:migrate` | Run migrations |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm db:seed` | Seed script (placeholder) |
| `pnpm typecheck` | tsc --noEmit |
| `pnpm test:run` | Vitest one-shot |
| `pnpm lint` | ESLint |
