# Pre-PR Quality Checklist

Before pushing any branch for review, work through this checklist.
A PR should only catch genuine edge cases — not basic correctness errors.

---

## 1. Know the tools you're using

Before writing code that uses a library or platform feature, verify behaviour
if you are not certain. Do not assert facts about runtime behaviour (Postgres,
Redis, Node.js, Next.js, BullMQ) without either knowing them with confidence
or testing them. When in doubt, write a quick empirical test (e.g. a psql
command against the running Docker container) rather than guessing.

Common failure modes to check explicitly:
- **Postgres**: array assignment on NULL columns, JSONB merge behaviour,
  constraint interactions, 1-based vs 0-based indexing
- **Next.js App Router**: config exports that only work in Pages Router
  (e.g. `api.bodyParser`); route segment config that does/doesn't apply
- **BullMQ**: job concurrency, retry behaviour, deduplication by jobId
- **MinIO client**: `endPoint` expects hostname only (not host:port);
  `useSSL` vs `useSSL` at proxy boundary

---

## 2. Security checklist

For every mutation or query, check:
- [ ] Authentication: is this behind `protectedProcedure`?
- [ ] Authorisation: does the caller own or have access to the resource?
  A user being logged in does not mean they own the record.
- [ ] Input validation: are all user-supplied values validated before use?
- [ ] SQL safety: no `sql.raw()` with user-controlled input. Use parameterized
  `sql` template tags only.
- [ ] Injection: no string interpolation into SQL, shell commands, or HTML.

---

## 3. Code quality checklist

- [ ] No magic strings for DB table/column names — reference Drizzle schema objects
- [ ] No duplicate constants — single source of truth, exported and imported
- [ ] Lint and typecheck pass: `pnpm typecheck && pnpm lint`
- [ ] No unused imports or variables (lint enforces this at 0 warnings)
- [ ] Error paths are handled — not just the happy path
- [ ] Fire-and-forget async calls use `.catch()` with a meaningful log

---

## 4. PR description standard

The PR description must be self-contained for a reviewer who cannot see
the rest of the codebase. Every PR must include:

**Summary** — what changed and why, at the feature/behaviour level.

**Security model** — state explicitly how auth/authz is enforced.
Name the file if it relies on code outside the diff (e.g. middleware,
DB cascade, Drizzle schema constraint).

**Known tradeoffs** — document any deliberate limitations:
- Unbounded queries acceptable at MVP scale
- Fire-and-forget with recovery mechanism
- Missing feature deferred to a later story (name the story/issue)
Do not let the reviewer discover these — name them first.

**Verified behaviour** — if the implementation relies on a specific
runtime behaviour (Postgres, Node.js, Next.js), state that it was
verified and how (e.g. "tested on Postgres 16 — see comment in code").

---

## 5. Responding to reviewer comments

When pushing a follow-up commit to address review comments:

1. **Reply to each comment** before or immediately after pushing.
   Reference the commit SHA. Explain what was done and why.

2. **Commit message must reference reviewer concerns** — not just
   "fix review comments". Use the format:
   ```
   Reviewer responses (round N):
   Block #1 — <topic>: <what was done and verified>
   Warning #1 — <topic>: <what was done or why deferred>
   ```

3. **Update the PR description** if the fix changes the design or
   tradeoff profile significantly (e.g. changed from approach A to B,
   or a known tradeoff was resolved rather than deferred).

4. **Do not introduce new issues when fixing old ones.** After making
   fixes, re-run the full pre-PR checklist above before pushing.
   Check that changed files are still type-safe and lint-clean.
