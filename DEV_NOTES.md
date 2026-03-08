# Dev Notes

Quick reference for local development.

## Starting the app

```bash
bash dev-start.sh   # first time (or after a clean wipe)
pnpm dev            # start the Next.js dev server
```

## URLs

| URL | What |
|---|---|
| http://localhost:3000 | App |
| http://localhost:8025 | Mailhog — catches all dev emails |
| http://localhost:9001 | MinIO console — file storage (login: `minioadmin` / `minioadmin`) |

## Test accounts

All have password: **`password123`**

| Email | Username | Notes |
|---|---|---|
| alice@campfire.local | @alice | Owner of "Friday Night Squad", friends with bob + carol |
| bob@campfire.local | @bob | Member of "Friday Night Squad", friends with alice |
| carol@campfire.local | @carol | Member of "Friday Night Squad", friends with alice |

Seed is safe to re-run — it skips rows that already exist:
```bash
pnpm db:seed
```

## Useful commands

| Command | What |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm db:studio` | Drizzle Studio — browse/edit the database in a UI |
| `pnpm db:seed` | Create test accounts + group |
| `pnpm db:generate` | Generate a new migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` | ESLint |
| `pnpm test:run` | Vitest unit tests |

## Docker

```bash
docker-compose up -d      # start all services
docker-compose down       # stop all services
docker-compose logs -f    # tail logs from all services
```

## Session notes

- Sessions expire after 7 days (better-auth default). If you're redirected to `/login` mid-session, just log in again.
- In dev, a Next.js hot-reload can briefly reset the DB connection pool. The layout catches this and redirects cleanly rather than crashing.

## Features built (Phase 1)

| Feature | Route |
|---|---|
| Games library | `/games` — add games, filter by platform, remove |
| Availability | `/availability` — week view, add/edit/delete time blocks with visibility controls |
| Events | `/events` — create events per group, list with status badges |
| Event detail + polls | `/events/[id]` — RSVP, poll voting with live bars, confirm/cancel (creator) |
| Email jobs | BullMQ: event confirmed/cancelled, RSVP reminder (24h before), poll opened/closed |
| Settings + notification prefs | `/settings` — username, toggle every email/in-app category |

## Adding yourself to seed data

The seed accounts are fixed. To connect your own account to them, run SQL directly:

```bash
docker-compose exec postgres psql -U campfire -d campfire
```

```sql
-- Accept a pending friend request from your account to alice
UPDATE friendships SET status = 'accepted', updated_at = NOW()
  WHERE requester_id = '<your-id>' AND addressee_id = 'seed-user-alice';

-- Add yourself to the Friday Night Squad group
INSERT INTO group_memberships (group_id, user_id, role, joined_at)
  VALUES ('seed-group-main', '<your-id>', 'member', NOW())
  ON CONFLICT DO NOTHING;
```

Find your user ID:
```sql
SELECT id, email FROM "user";
```
