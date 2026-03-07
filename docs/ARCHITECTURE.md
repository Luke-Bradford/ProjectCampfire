# Architecture

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend + API | Next.js 15 (App Router, TypeScript) | Full-stack in one repo; RSC reduces client bundle; eliminates a separate API service until scale demands it |
| API layer | tRPC v11 | Type-safe end-to-end with no schema maintenance; REST adapter available if needed later |
| Database | PostgreSQL 16 | Relational model fits the domain exactly; JSONB for flexible metadata; full-text search built-in; trivially self-hostable |
| ORM | Drizzle ORM | Type-safe; SQL-close; migrations output inspectable SQL files |
| Auth | Lucia Auth | Self-hostable; no third-party auth service dependency; email/password now, OAuth later |
| Background jobs | BullMQ + Redis | Email delivery, OG tag fetching, image processing, poll auto-close, Steam sync (Phase 2) |
| Sessions / cache | Redis (Valkey) | Fast session store; BullMQ queue backend |
| Object storage | MinIO | S3-compatible; self-hostable; swap to real S3 with one env var change |
| Image processing | Sharp (Node.js) | Resize and optimise images before MinIO storage; runs in the worker, not the request path |
| Email | Nodemailer + SMTP | Mailhog in dev; Resend/Postmark/SES in production via env var |
| Reverse proxy | Caddy | Automatic HTTPS via Let's Encrypt; minimal config |
| UI components | shadcn/ui + Tailwind CSS | Copy-owned components; Radix UI accessibility primitives; Tailwind for utility styling |
| Icons | Lucide React | Used natively by shadcn |
| Containers | Docker Compose | Self-hosting; portable to Swarm/K8s if needed |
| Search | Postgres full-text | Sufficient for username and game title search at prototype scale |

---

## Why not the alternatives

**Separate backend service (NestJS, Go, etc.):** Premature service boundary before the API surface is stable. Add when scale demands it.

**Prisma:** Slower query performance; over-abstracts PostgreSQL; migration files are harder to inspect than Drizzle's SQL output.

**Supabase / PlanetScale / Neon:** Vendor-hosted. Violates the self-hosting intent. The patterns are fine; the managed service is not.

**GraphQL:** Schema maintenance overhead that tRPC avoids entirely in a monorepo.

**Elasticsearch / Meilisearch:** Not needed until the game catalog exceeds tens of thousands of records. Postgres full-text handles it.

**WebSockets / real-time:** The feed is async (post-based, not chat). Deferred until a real demand signal exists.

**Firebase:** Not self-hostable; NoSQL mismatch for this relational domain.

---

## Service diagram

```
                        ┌───────────────────────────────────────────────────────┐
                        │                  Docker Compose Host                  │
                        │                                                       │
  Browser / Mobile Web  │  ┌─────────┐        ┌──────────────────────────────┐ │
  ───────────────────►  │  │  Caddy  │──HTTPS─►│      Next.js App (SSR)       │ │
                        │  │ proxy + │         │  ┌────────────────────────┐  │ │
                        │  │   TLS   │         │  │  React UI (RSC + CSR)  │  │ │
                        │  └─────────┘         │  ├────────────────────────┤  │ │
                        │                      │  │  tRPC API Routes       │  │ │
                        │                      │  ├────────────────────────┤  │ │
                        │                      │  │  Auth (Lucia)          │  │ │
                        │                      │  ├────────────────────────┤  │ │
                        │                      │  │  OG Unfurl (queued)    │  │ │
                        │                      │  ├────────────────────────┤  │ │
                        │                      │  │  Image upload → queue  │  │ │
                        │                      │  └───────────┬────────────┘  │ │
                        │                      └──────────────┼───────────────┘ │
                        │                                     │                 │
                        │                    ┌────────────────┼─────────────┐   │
                        │                    │                │             │   │
                        │            ┌───────▼──────┐  ┌──────▼──────┐     │   │
                        │            │  PostgreSQL  │  │    Redis    │     │   │
                        │            │  primary DB  │  │  sessions + │     │   │
                        │            │  FTS search  │  │  job queues │     │   │
                        │            └──────────────┘  └──────┬──────┘     │   │
                        │                                      │            │   │
                        │                           ┌──────────▼─────────┐  │   │
                        │                           │   BullMQ Worker    │  │   │
                        │                           │  ┌──────────────┐  │  │   │
                        │                           │  │ Email send   │  │  │   │
                        │                           │  │ OG fetch     │  │  │   │
                        │                           │  │ Image proc   │  │  │   │
                        │                           │  │ Poll close   │  │  │   │
                        │                           │  │ Steam sync*  │  │  │   │
                        │                           │  └──────┬───────┘  │  │   │
                        │                           └─────────┼──────────┘  │   │
                        │                                     │             │   │
                        │                           ┌─────────▼──────────┐  │   │
                        │                           │   MinIO (S3)        │  │   │
                        │                           │   post images       │  │   │
                        │                           │   avatars           │  │   │
                        │                           └────────────────────┘  │   │
                        │                                                    │   │
                        └────────────────────────────────────────────────────┘   │

  * Phase 2 only

  External services (Phase 2+)
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐
  │  Steam API   │  │  IGDB API    │  │  SteamSpy    │  │  SMTP Relay    │
  │  owned games │  │  game meta   │  │  player data │  │  (production)  │
  └──────────────┘  └──────────────┘  └──────────────┘  └────────────────┘
```

---

## Key data flows

### Session planning loop

```
Members set availability blocks
         │
         ▼
Organiser creates Event + polls (time + game, or standalone)
         │
         ▼
Members vote → tRPC mutation → Postgres write
         │
         ▼
Poll closes (manual trigger or BullMQ scheduled job)
         │
         ▼
Organiser confirms Event → status = confirmed, times set
         │
         ▼
BullMQ: enqueue RSVP email for each GroupMember
         │
         ▼
Members receive email → click RSVP link (signed token, no re-login)
         │
         ▼
EventRSVP written → organiser sees attendance list
         │
         ▼
BullMQ: enqueue reminders at T-24h and T-1h
```

### Post submission flow

```
User submits post (text + optional images + optional URL)
         │
         ├── Images present?
         │       └── Enqueue image processing job
         │               → Sharp resize + optimise → MinIO upload
         │               → On complete: update Post.image_urls
         │
         └── URL present?
                 └── Enqueue OG fetch job (5s timeout)
                         → On complete: update Post.embed_metadata
                         → On timeout/fail: store as plain link
                         (post is immediately visible; enrichment populates async)
```

### Feed query

```sql
SELECT p.*
FROM posts p
WHERE p.deleted_at IS NULL
  AND (
    -- From accepted friends
    p.author_id IN (
      SELECT CASE
        WHEN requester_id = :me THEN addressee_id
        ELSE requester_id
      END
      FROM friendships
      WHERE (requester_id = :me OR addressee_id = :me)
        AND status = 'accepted'
    )
    OR
    -- From groups I'm a member of
    p.group_id IN (
      SELECT group_id FROM group_memberships WHERE user_id = :me
    )
  )
  -- Exclude content from users I have blocked or who have blocked me
  AND p.author_id NOT IN (
    SELECT CASE
      WHEN requester_id = :me THEN addressee_id
      ELSE requester_id
    END
    FROM friendships
    WHERE (requester_id = :me OR addressee_id = :me)
      AND status = 'blocked'
  )
  -- Suppress repost content if original author is now private or post is deleted
  AND (
    p.repost_of_id IS NULL
    OR EXISTS (
      SELECT 1 FROM posts op
      JOIN users u ON u.id = op.author_id
      WHERE op.id = p.repost_of_id
        AND op.deleted_at IS NULL
        AND u.profile_visibility = 'open'
    )
  )
ORDER BY p.created_at DESC
LIMIT 50
-- Cursor-paginated on (created_at, id) for stable pagination
```

---

## Docker Compose services

| Service | Image | Purpose | Volumes |
|---|---|---|---|
| `app` | Custom (Next.js) | Web application, port 3000 | — |
| `worker` | Same as `app` | BullMQ worker (different entrypoint) | — |
| `postgres` | `postgres:16-alpine` | Primary database | `postgres_data` |
| `redis` | `valkey/valkey:7-alpine` | Sessions + job queues | `redis_data` |
| `minio` | `minio/minio` | Object storage (avatars, images) | `minio_data` |
| `caddy` | `caddy:2-alpine` | Reverse proxy + auto TLS | `caddy_data`, `Caddyfile` |
| `mailhog` | `mailhog/mailhog` | Dev SMTP catcher, port 8025 | — (dev only) |

Target memory at rest: ~600–800MB. Runs comfortably on a 2GB VPS.

---

## Environment variables

All configuration is via environment variables. Copy `.env.example` to `.env` and fill in values. The app validates all required variables at startup using `@t3-oss/env-nextjs` — it will crash with a clear error message if anything is missing rather than silently failing at runtime.

Key variable groups:

| Group | Variables |
|---|---|
| Database | `DATABASE_URL` |
| Redis | `REDIS_URL` |
| Auth | `AUTH_SECRET` |
| MinIO | `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` |
| App | `NEXT_PUBLIC_APP_URL` |
| IGDB (Phase 2) | `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` |
| Steam (Phase 2) | `STEAM_API_KEY` |

---

## Self-hosting: production setup

```bash
# 1. Clone and configure
git clone https://github.com/your-org/projectcampfire.git
cd projectcampfire
cp .env.example .env
# Edit .env — set DATABASE_URL, AUTH_SECRET, SMTP_*, MINIO_*, NEXT_PUBLIC_APP_URL

# 2. Start services
docker compose -f docker-compose.prod.yml up -d

# 3. Run migrations
docker compose exec app pnpm db:migrate

# 4. Verify
curl https://yourdomain.com/api/health
```

Caddy handles TLS automatically via Let's Encrypt when `NEXT_PUBLIC_APP_URL` is set to a real domain.

---

## Migrating to managed hosting

The prototype is designed for a clean migration to any VPS or container platform:

1. Provision a new host (VPS, Railway, Render, Fly.io, etc.)
2. Set up a managed Postgres instance (or run it in Docker)
3. Copy your `.env` and update connection strings
4. Run `docker compose up` (or platform-equivalent)
5. Run `pnpm db:migrate`

No data migration is required if starting fresh. If migrating existing data, use `pg_dump` / `pg_restore` against the Postgres volume.

---

## External API dependencies (Phase 2+)

All external API calls are background jobs, never in the request path. Data is copied locally on import — the app never depends on live external API availability.

| API | Purpose | Risk mitigation |
|---|---|---|
| IGDB | Game metadata import | Feature-flagged; data stored locally on import; manual entry is the fallback |
| Steam Web API | User's owned games list | Opt-in; manual ownership covers Phase 1 |
| Steam Store API | Price snapshots | Snapshotted to `metadata_json`; stale data is acceptable |
| SteamSpy | Player count and ownership estimates | Background job; failure is logged, not surfaced to user |
| SMTP relay | Email delivery | Configured via env var; Mailhog in dev |
