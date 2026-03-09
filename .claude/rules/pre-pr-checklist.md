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

## Responding to review comments

1. Reply to **each comment** with what was done and the commit SHA.
2. Commit message must list each reviewer concern addressed (not just "fix review").
3. Update the PR description if the design changed significantly.
4. Re-run `pnpm typecheck && pnpm lint` after every fix before pushing.
