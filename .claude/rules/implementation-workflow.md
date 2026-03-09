# Implementation Workflow

When asked to implement or modify something in ProjectCampfire:

1. Read the relevant files before proposing changes.
2. Restate the task in terms of the current product and phase.
3. Identify the affected layers:
   - UI
   - routing/API
   - business logic
   - database/schema
   - background jobs
   - docs/tests
4. If the request is ambiguous and affects behavior, schema, permissions, or architecture, pause and surface the ambiguity.
5. Prefer the narrowest implementation that fits the current MVP.
6. Do not widen scope unless explicitly requested.
7. Do not introduce new dependencies without justification.
8. Keep routers thin and business logic out of UI components.
9. If product behavior, schema, or architecture changes, update the relevant docs.
10. After implementation, summarize:
   - what changed
   - affected files
   - risks
   - what should be tested

## PR description standard

PRs are reviewed by an automated agent that only sees the diff, not the full codebase.
Write PR descriptions that make the change self-contained and reviewable without needing
to read other files. Specifically:

- **State the security model explicitly.** If a security property relies on code *outside*
  the diff (e.g. a middleware, a DB hook, a cascade constraint), name the file and explain
  the relationship. Don't assume the reviewer can see it.
- **Explain deliberate removals.** If something was added then removed across commits,
  explain why in the description so the reviewer doesn't flag the removal as a regression.
- **Document known-safe patterns.** If a pattern looks questionable but is intentional
  (e.g. fire-and-forget with a recovery mechanism, `null` in a unique column), explain it
  in the description rather than in a comment thread after the fact.
- **Keep the description current.** If a round of review causes significant design changes,
  update the PR description to reflect the final state — not just the original intent.