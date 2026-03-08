# Tech Debt & Known Issues

Items to address in Phase 1 polish or Phase 2. Not blockers for feature development.

---

## Feed / Posts

| # | Issue | Notes |
|---|---|---|
| ~~TD-001~~ | ~~Comment ordering~~ | Fixed — oldest-first, limit 20 |
| ~~TD-002~~ | ~~Comment timestamp hover~~ | Fixed — `title` attribute on timestamp |
| TD-003 | Comment author name shown inside the bubble | Consider name above bubble for clarity |
| TD-004 | Like on comments not implemented | `toggleLike` only handles posts. Extend to accept `commentId` too (CAMP-089) |
| TD-005 | Repost not implemented | CAMP-090–093. Needs permission check (`profile_visibility = open`) |
| TD-006 | Post edit not implemented | CAMP-086. Update body, set `editedAt`, show "edited" label |
| TD-007 | Feed only loads 20 posts, no pagination | Cursor-based pagination wired in router but no "load more" button |
| TD-008 | No optimistic updates on like/comment | Full feed refetch on action. Fine for now, noticeable on slow connections |

## Auth / Profile

| # | Issue | Notes |
|---|---|---|
| TD-009 | No avatar upload yet | CAMP-005. MinIO + Sharp pipeline needed |
| TD-010 | Password reset landing page not built | `/reset-password` page for the email link — CAMP-003 |
| TD-011 | Username change cooldown not enforced | 30-day cooldown stored (`usernameChangedAt`) but not checked in `setUsername` |
| TD-012 | No profile page (`/u/[username]`) | CAMP-021. Open profiles + add-friend button; private profiles minimal |
| TD-018 | Display name edit in Settings is cosmetic only | Field exists but mutation not wired — needs a `setDisplayName` procedure |

## Groups

| # | Issue | Notes |
|---|---|---|
| TD-013 | No active nav link highlighting | All nav links same colour regardless of current route |
| TD-014 | Group invite link uses placeholder on onboarding step 3 | Needs real per-user invite token (CAMP-022) |

## Events / Polls

| # | Issue | Notes |
|---|---|---|
| TD-019 | No group overlap view on availability page | `groupOverlap` router procedure exists but no UI yet |
| TD-020 | Poll auto-close via BullMQ not implemented | `closesAt` field exists but no scheduled job to close polls when time elapses |
| TD-021 | Event RSVP reminder job only scheduled on confirm | Members who RSVP after confirm don't update the reminder list |
| TD-022 | My RSVP status not highlighted on event detail | RSVP buttons don't show current selection (need to compare against `event.rsvps`) |

## Infrastructure

| # | Issue | Notes |
|---|---|---|
| TD-015 | Rate limiting not implemented | CAMP-156. Search, registration, post submission all need rate limiting |
| TD-016 | Image upload validation not implemented | CAMP-157. Type allowlist + 5MB size limit needed before MinIO uploads |
| TD-017 | No `/api/health` endpoint | CAMP-159. Simple liveness check for production monitoring |
| TD-023 | Better-auth session occasionally drops in dev | Hot-reload resets DB pool; layout now catches the error gracefully. Not a prod issue |
