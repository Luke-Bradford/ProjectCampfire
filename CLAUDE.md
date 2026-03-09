# ProjectCampfire

ProjectCampfire is a private-first social planning app for friend groups who game together.

It helps users:
- add friends
- create private groups
- share availability
- plan gaming sessions
- vote on games and times
- keep related discussion in one place
- view lightweight game context as supporting information

## Product Boundaries

ProjectCampfire is **not** a broad public social network in MVP.

Do not expand the MVP into:
- public threads or public game communities
- live chat, voice, or streaming infrastructure
- recommendation engines
- broad moderation-heavy public spaces
- deep third-party platform dependence
- unnecessary feed complexity

For MVP, the core value is:

**Helping friend groups decide what to play, when to play, who is available, and who already owns the game.**

Game metadata, price/popularity data, and external integrations are supporting features, not the product core.

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

## Docker & Data Safety

**NEVER run `docker compose down -v`** — this destroys the named volumes (`postgres_data`, `redis_data`, `minio_data`) and permanently wipes all database content including manually-created user data that cannot be recovered from seed.

Safe commands:
- `docker compose up --build` — start everything, data persists
- `docker compose down` — stop everything, data persists
- `docker compose restart <service>` — restart a single service, data persists

Destructive (require explicit user confirmation every time, no exceptions):
- `docker compose down -v` — destroys ALL volume data
- `docker volume rm projectcampfire_postgres_data` — destroys the database

The database lives in the Docker named volume `projectcampfire_postgres_data`. It persists across restarts. Seeding is only needed on a genuinely fresh/wiped database.

## Working Style

When making changes:
- Read the relevant files first.
- Prefer the smallest useful implementation.
- Preserve existing architectural boundaries.
- Do not introduce new dependencies without justification.
- Do not widen MVP scope unless explicitly asked.
- If a change affects product behavior, schema, or architecture, update docs.
- Explain risks, assumptions, and follow-on work clearly.

Prefer incremental delivery over large speculative refactors.

## Work Tracking

**Source of truth: [GitHub Issues](https://github.com/Luke-Bradford/ProjectCampfire/issues)** with milestones per phase.

- Stories use `CAMP-XXX` IDs (e.g. `CAMP-001`)
- Milestones: Phase 0 (Foundation) → Phase 1 (Planning Loop) → Phase 2 (Enrichment) → Phase 3 (Polish)
- Labels: `epic:auth`, `epic:friends`, `epic:groups`, `epic:feed`, `epic:planning`, `epic:games`, `epic:availability`, `epic:notifications`, `epic:onboarding`, `epic:infra`, `tech-debt`
- To find next work: `gh issue list --milestone "Phase 0 — Foundation" --state open`

## Key Conventions

- **Auth:** better-auth (not Lucia). User table is `user` (singular). Session uses `token` field.
- **Schema:** All custom profile fields live on the `user` table. See `src/server/db/schema/auth.ts`.
- **Validation:** Validate all procedure inputs explicitly.
- **tRPC:** Keep routers thin. Put business logic in server-side services/helpers, not UI components.
- **Database access:** Do not place database logic in React presentation components.
- **BullMQ:** Use background jobs only for slow, external, retryable, or async work (email, sync, processing). Export bullmqConnection as a plain options object from src/server/redis.ts.
- **Lint:** Use `eslint src --max-warnings 0` directly (`next lint` is deprecated in Next.js 15).
- **Env validation:** `src/env.ts` uses `@t3-oss/env-nextjs` with Zod v4. The app should fail fast if required variables are missing.

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

## Notes for AI Assistance

- Before implementing anything substantial:
- identify the affected files
- check whether the task belongs in the current phase
- avoid introducing future-phase behavior unless explicitly requested
- keep solutions self-hosted and compatible with Docker Compose deployment
- prefer maintainability and clarity over cleverness
