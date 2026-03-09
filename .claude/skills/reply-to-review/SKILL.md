---
name: reply-to-review
description: Address the latest round of PR review comments on the current branch. Use when the user asks to fix review comments, address feedback, or respond to a PR review.
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(git *), Bash(pnpm *), Bash(docker *), Read, Edit, Write, Grep, Glob, WebSearch
---

Address the latest round of PR review comments on the current branch.

## Step 1 — Read the full review history

```bash
gh pr view --comments
gh pr diff
```

Identify the latest review round. List every comment and classify:
- BLOCKING — must fix
- WARNING — should fix
- NITPICK — optional
- ALREADY FIXED — addressed in a previous commit, do not re-raise

## Step 2 — Verify before fixing

Before touching any code, for each BLOCKING/WARNING:
- Read the relevant files first.
- If the comment makes a claim about runtime behaviour (Postgres, Next.js, BullMQ, MinIO),
  verify it empirically or via WebSearch before accepting it as correct.
  A reviewer can be wrong. Do not blindly apply fixes that introduce new problems.
- If the comment is factually incorrect, document why in the reply rather than
  making an unnecessary change.

See [verification-guide.md](verification-guide.md) for how to test common claims.

## Step 3 — Fix, one item at a time

For each item being fixed:
1. Make the change.
2. Immediately run `pnpm typecheck && pnpm lint` — fix any new errors before moving on.
3. Re-read the changed diff to check no new issues were introduced.

Do not batch up all changes and check at the end.

## Step 4 — Commit

Stage only the files that changed. Commit message format:

```
fix(<ticket>): address review round N

Reviewer responses:
Block #1 — <topic>: <what was done and why>
Block #2 — <topic>: <what was done and why>
Warning #1 — <topic>: <what was done, or why deferred/rejected>
Nitpick #1 — <topic>: fixed / deferred / won't fix (reason)
```

## Step 5 — Push and reply

Push the branch, then reply to each GitHub comment:

```bash
git push
# Get the commit SHA
SHA=$(git rev-parse --short HEAD)
# Reply to each comment by ID
gh api repos/Luke-Bradford/ProjectCampfire/pulls/<PR>/comments/<comment-id>/replies \
  --method POST --field body="<response>"
```

Each reply must include:
- What was done (or why the comment was declined)
- The commit SHA where the fix lives

## Step 6 — Update PR description if needed

If the fix changed the design, security model, or tradeoff profile:
```bash
gh pr edit --body "..."
```
