Pick up the next open task from the current milestone and implement it.

1. Run `gh issue list --milestone "Phase 0 — Foundation" --state open` to see
   open work. If Phase 0 is empty, check Phase 1.
2. Choose the most appropriate next issue — prefer infra/foundation blockers
   over feature work. Show the candidate to the user and confirm before starting.
3. Read the issue description fully with `gh issue view <number>`.
4. Before writing any code:
   - Identify affected layers (UI, tRPC router, DB schema, worker, docs)
   - Check whether it belongs in the current phase
   - Read the relevant existing files
   - If the task involves a library or platform feature you are not certain about,
     use /research first
5. Implement with the narrowest useful scope. Follow CLAUDE.md conventions.
6. Run `pnpm typecheck && pnpm lint` — both must pass before committing.
7. Commit, push, open PR with a complete description per the PR standard in
   `.claude/rules/pre-pr-checklist.md`.
8. Close or update the GitHub issue.
