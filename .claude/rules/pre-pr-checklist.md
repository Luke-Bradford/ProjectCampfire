# PR & Review Standards

These rules apply at all times.

## Before pushing for review

A PR should only catch genuine edge cases — not basic correctness errors that
could have been caught locally. Before pushing:

1. Re-read the full diff (`git diff main...HEAD`) as if you are the reviewer.
2. Run `pnpm typecheck && pnpm lint` — both must be clean.
3. Check every changed file against the security checklist below.
4. Write or update the PR description (see standard below).

## Security checklist (every mutation and query)

- Authentication: is this behind `protectedProcedure`?
- Authorisation: does the caller own or have access to the resource?
  `protectedProcedure` = logged in. It does NOT = owns the record. Check both.
- Input validation: all user-supplied values validated with Zod before use?
- SQL safety: no `sql.raw()` with any runtime value. Use parameterised `sql` tags.
- No magic strings for schema identifiers — reference Drizzle table/column objects.

## PR description standard

Must be self-contained for a reviewer with no codebase context:

- **Summary**: what changed and why.
- **Security model**: how auth/authz is enforced. Name files outside the diff.
- **Known tradeoffs**: document deliberate limitations before the reviewer finds them.
  Use a "Known tradeoffs" section. Verified behaviour claims must state how they were verified.

## Bug tracking convention

When a bug is found (in testing, in prod, or reported by the user):

1. **Create a GitHub issue** with label `bug` (+ relevant epic label).
   - Title: `bug: <short description>`
   - Body: what the symptom was, root cause, how it was fixed, commit SHA.
2. **Reference the original feature** — if the bug was introduced by a known PR/commit, link it.
3. **Close the issue** once fixed, with the fix commit in the close comment or body.

This applies even when the fix is trivial and already committed. The record exists for accountability, regression tracking, and pattern recognition across bugs.

## After pushing a PR — mandatory PR watch loop

Immediately after every `git push` that creates or updates a PR:

1. **Start polling** — check `gh pr view <number> --comments` every ~30–45 seconds.
   Do not end the conversation or move on while a PR is open and unreviewed.
2. **Act on every severity** — BLOCKING and WARNING must be fixed before merge.
   After each review round, assess every WARNING and NITPICK for future value:
   - Does it identify a real UX gap, security hardening opportunity, or maintainability concern?
   - If yes → create a GitHub issue (label: `tech-debt`) with enough context to act on later.
   - If no (pure style, already-safe pattern, out-of-scope) → explicitly decide to drop it and move on.
   The goal is zero silently discarded feedback. Either fix it or track it.
3. **Reply to each comment** with what was done and the commit SHA.
4. **Merge** once the review bot issues an APPROVE with no outstanding items.
5. **Close linked GitHub issues** after merging.
6. **Stop polling** only after the PR is merged and issues are closed.

This loop is non-negotiable. It does not require the user to prompt it.

## Responding to review comments

1. Reply to **each comment** with what was done and the commit SHA.
2. Commit message must list each reviewer concern addressed (not just "fix review").
3. Update the PR description if the design changed significantly.
4. Re-run `pnpm typecheck && pnpm lint` after every fix before pushing.
