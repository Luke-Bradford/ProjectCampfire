Address the latest round of PR review comments on the current branch.

1. Run `gh pr view --comments` to read all comments. Identify the latest review round.
2. For each comment in the latest round, classify it: BLOCKING / WARNING / NITPICK / already-fixed.
3. For BLOCKINGs and WARNINGs not yet addressed:
   a. Read the relevant files before changing anything.
   b. Verify any runtime behaviour claims empirically (e.g. test against the running Docker DB).
   c. Make the fix. Run `pnpm typecheck && pnpm lint` before moving to the next item.
   d. Do not introduce new issues while fixing old ones — re-read the diff after each change.
4. Stage and commit with a message that lists each reviewer concern addressed:
   ```
   fix(<ticket>): address review round N

   Reviewer responses:
   Block #1 — <topic>: <what was done and verified>
   Warning #1 — <topic>: <what was done or why deferred>
   ```
5. Push the branch.
6. Reply to each GitHub comment via `gh api` with: what was done + the commit SHA.
7. If the fixes changed the design or tradeoffs, update the PR description with `gh pr edit`.
