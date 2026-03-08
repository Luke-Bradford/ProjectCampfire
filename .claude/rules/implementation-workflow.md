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