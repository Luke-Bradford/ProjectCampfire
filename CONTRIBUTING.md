# Contributing

## Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)

---

## Local development setup

```bash
# 1. Clone
git clone https://github.com/your-org/projectcampfire.git
cd projectcampfire

# 2. Environment
cp .env.example .env
# Edit .env if needed — defaults work for local dev

# 3. Start services
docker compose up -d

# 4. Install dependencies
pnpm install

# 5. Run migrations
pnpm db:migrate

# 6. Seed development data
pnpm db:seed

# 7. Start dev server
pnpm dev
```

| URL | Service |
|---|---|
| `http://localhost:3000` | Application |
| `http://localhost:8025` | Mailhog (email catcher) |
| `http://localhost:9001` | MinIO console |
| Run `pnpm db:studio` | Drizzle Studio (database GUI) |

---

## Branch strategy

We use **GitHub Flow**:

- `main` is always deployable — no direct pushes
- Create a feature branch from `main`
- Open a pull request back into `main`
- Squash merge on approval

**Branch naming:**

```
feature/CAMP-001-email-auth
feature/CAMP-080-activity-feed
fix/CAMP-083-og-fetch-timeout
chore/update-drizzle-orm
docs/architecture-diagram
```

Always prefix with the backlog ID (`CAMP-XXX`) where one exists.

---

## Commit format

We use [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must follow this format:

```
type(scope): short description in present tense
```

**Types:**

| Type | When to use |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `chore` | Dependency updates, config, tooling |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `refactor` | Code change with no behaviour change |
| `perf` | Performance improvement |
| `ci` | CI/CD pipeline changes |

**Examples:**

```
feat(feed): add repost permission check against author profile visibility
fix(auth): handle expired session token with correct redirect
chore(deps): update drizzle-orm to 0.30.0
test(polls): add coverage for standalone poll creation
docs(domain-model): add blocking asymmetry section
```

Commitlint enforces this via a pre-commit hook. Commits that don't match the format are rejected.

---

## Pull request process

1. Branch from `main` using the naming convention above
2. Keep PRs focused — one feature or fix per PR
3. Fill in the PR template fully
4. All CI checks must pass before merge is allowed:
   - `typecheck` — `tsc --noEmit`
   - `lint` — ESLint
   - `format` — Prettier check
   - `test` — Vitest unit tests
   - `build` — Next.js production build
5. At least one review required before merge
6. Squash merge into `main` — keep the history clean

---

## Testing

### What must have tests

- All tRPC procedures (test the business logic, not the transport layer)
- All permission checks (blocking, repost rules, profile visibility, group access)
- All background job handlers (email, OG fetch, image processing, poll close)
- Feed query filters (block direction, soft delete, private author suppression)

### What does not need unit tests

- UI components (Playwright E2E covers happy paths)
- Drizzle schema definitions
- Next.js page components

### Running tests

```bash
pnpm test           # Run all unit tests
pnpm test:watch     # Watch mode
pnpm test:coverage  # Coverage report
```

### Test conventions

- Test files live alongside the code they test: `foo.ts` → `foo.test.ts`
- Use `@faker-js/faker` for test data — never hardcode magic strings
- Mock external API calls (IGDB, Steam, SteamSpy) — tests must not make real network requests
- Each test file should be independently runnable with no shared global state

---

## Code style

**TypeScript:** Strict mode enabled. No `any`. No `as` casts without a comment explaining why.

**Imports:** Absolute imports via path aliases (`@/components/...`, `@/server/...`). No relative imports that traverse more than one level up.

**Tailwind:** Classes sorted automatically by `prettier-plugin-tailwindcss`. Run `pnpm format` before committing.

**Components:** Use shadcn/ui primitives where they exist. Do not write custom accessible primitives from scratch.

**Database:** Never call external APIs (IGDB, Steam, SteamSpy) in the request path. All external calls are background jobs. All external data is stored locally in Postgres on first fetch.

**Error handling:** Use tRPC's `TRPCError` for API errors with appropriate HTTP codes. Do not expose internal error messages to the client.

**Soft deletes:** Use `deleted_at` timestamps. Never hard-delete records in the request path.

---

## Adding a new tRPC procedure

1. Create or open the relevant router in `src/server/routers/`
2. Write the procedure with input validation via Zod
3. Add business logic in a separate function that can be unit tested independently of tRPC
4. Write tests for the business logic function
5. Export the router and mount it in `src/server/routers/index.ts` if new

---

## Adding a new background job

1. Define the job in `src/server/jobs/`
2. Register the queue and worker in `src/server/jobs/index.ts`
3. Enqueue via the queue client — never call job logic directly from the request path
4. Handle failures: log to structured logger, use BullMQ's built-in retry with exponential backoff
5. Write a unit test for the job handler function

---

## Database migrations

```bash
# Generate a migration from schema changes
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Open Drizzle Studio
pnpm db:studio
```

Migration files are SQL and live in `src/db/migrations/`. Review them before committing — they are the source of truth for schema history.

Never edit an already-applied migration file. Create a new one instead.
