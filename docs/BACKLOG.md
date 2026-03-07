# Backlog

Stories follow the format `CAMP-XXX`. Each references its parent epic. Phase is noted where it differs from Phase 0.

---

## Epic 1: Auth & Identity

| ID | Story | Phase |
|---|---|---|
| CAMP-001 | Email + password registration with email verification | 0 |
| CAMP-002 | Login / logout / session invalidation | 0 |
| CAMP-003 | Password reset via email token | 0 |
| CAMP-004 | Unique `@username` handle: 3–20 chars, lowercase, 30-day rename cooldown | 0 |
| CAMP-005 | User profile: display name, avatar upload (MinIO), bio | 0 |
| CAMP-006 | Profile visibility toggle: open / private | 0 |
| CAMP-007 | Notification preferences: email on/off per notification type | 0 |
| CAMP-008 | Account soft-delete (scrub PII via async job) | 0 |
| CAMP-009 | OAuth login: Google | 2 |
| CAMP-010 | OAuth login: Discord | 2 |

---

## Epic 2: Friend Discovery & Connections

| ID | Story | Phase |
|---|---|---|
| CAMP-020 | Username search (open profiles only, rate-limited to ~10/min per user) | 0 |
| CAMP-021 | Direct profile URL `/u/[username]`: open = add button; private = minimal page | 0 |
| CAMP-022 | Profile invite token: generate, display in settings, regenerate (invalidates old) | 0 |
| CAMP-023 | Invite link landing page: auto-request if registered; auto-accept on new signup | 0 |
| CAMP-024 | Send friend request | 0 |
| CAMP-025 | Accept / decline / cancel friend request | 0 |
| CAMP-026 | Friend list view | 0 |
| CAMP-027 | Remove friend | 0 |
| CAMP-028 | Block user (asymmetric shadow filter — see Domain Model) | 0 |
| CAMP-029 | Unblock from blocked-user content placeholder in feed | 0 |
| CAMP-030 | Steam friend matching: show Campfire users from Steam friends list | 2 |
| CAMP-031 | Steam friend invite: single-use targeted link, 14-day expiry | 2 |

---

## Epic 3: Groups

| ID | Story | Phase |
|---|---|---|
| CAMP-040 | Create group: name, description, avatar, visibility (standard / private) | 0 |
| CAMP-041 | Discord invite URL field on group profile (link-out only) | 0 |
| CAMP-042 | Group invite link: generate, join via link | 0 |
| CAMP-043 | Group member list | 0 |
| CAMP-044 | Standard group visible on member profile (name only, to friends of that member) | 0 |
| CAMP-045 | Leave group | 0 |
| CAMP-046 | Remove member (admin / owner only) | 3 |
| CAMP-047 | Transfer group ownership | 3 |
| CAMP-048 | Archive group | 3 |

---

## Epic 4: Availability

| ID | Story | Phase |
|---|---|---|
| CAMP-050 | Add availability block: date/time range, optional label, visibility setting | 1 |
| CAMP-051 | Edit / delete own availability block | 1 |
| CAMP-052 | Own availability calendar view | 1 |
| CAMP-053 | Group availability overlap view: show intersecting free windows across members | 1 |

---

## Epic 5: Session Planning

| ID | Story | Phase |
|---|---|---|
| CAMP-060 | Create event in a group: title, description, proposed time windows | 1 |
| CAMP-061 | Create time slot poll from proposed time windows | 1 |
| CAMP-062 | Create game poll: search catalog, select options, quick-add game inline | 1 |
| CAMP-063 | Create standalone group poll: custom question, any option type, not event-attached | 1 |
| CAMP-064 | Multiple polls per event: run time + game polls simultaneously | 1 |
| CAMP-065 | Voting UI: single and multi-select, live vote counts (refresh-based, no WebSocket) | 1 |
| CAMP-066 | Close poll manually | 1 |
| CAMP-067 | Poll auto-close: BullMQ job triggered when `closes_at` is set | 1 |
| CAMP-068 | Confirm event: select winning poll options, set status = confirmed | 1 |
| CAMP-069 | Cancel event | 1 |
| CAMP-070 | RSVP: yes / no / maybe on a confirmed event | 1 |
| CAMP-071 | RSVP via email link: signed token, no re-login required | 1 |
| CAMP-072 | Event detail page: poll results, RSVP list, ownership overlap per game option | 1 |
| CAMP-073 | Event reminder emails: BullMQ jobs at T-24h and T-1h | 1 |
| CAMP-074 | Recurring event template ("every Friday at 8pm") | 3 |

---

## Epic 6: Activity Feed & Social

| ID | Story | Phase |
|---|---|---|
| CAMP-080 | Text post to friend feed or group feed | 0 |
| CAMP-081 | 1,000 character limit with live counter (colour-shifts as limit approaches) | 0 |
| CAMP-082 | Up to 4 image uploads per post: BullMQ → Sharp resize → MinIO | 0 |
| CAMP-083 | One link unfurl per post: OG fetch via BullMQ, renders as card (async, post visible immediately) | 0 |
| CAMP-084 | YouTube URL → embedded player | 0 |
| CAMP-085 | All other URLs → rich preview card (title, description, thumbnail, link-out) | 0 |
| CAMP-086 | Post editing: update body/images; "edited" timestamp shown on post | 0 |
| CAMP-087 | Soft delete own post | 0 |
| CAMP-088 | Comments on posts: 1,000 char limit, editable, soft-deleteable | 0 |
| CAMP-089 | Reactions on posts and comments (like; enum extendable later) | 0 |
| CAMP-090 | Repost: permission check — author must have `profile_visibility = open` | 0 |
| CAMP-091 | Repost: button greyed out and non-interactive for private-profile authors | 0 |
| CAMP-092 | Repost: server-side enforcement (API rejects if author is private, regardless of client) | 0 |
| CAMP-093 | Repost: "Content no longer available" render state (original deleted or author went private) | 0 |
| CAMP-094 | Event-scoped post: discussion attached to a specific event | 0 |
| CAMP-095 | Pin post in group (admin only) | 0 |
| CAMP-096 | Unified feed: friends + groups, cursor-paginated, block-filtered, chronological | 0 |
| CAMP-097 | GIF support in posts: stored as image in MinIO, 10MB limit | 2 |
| CAMP-098 | "Hot" feed ranking: engagement-weighted, time-decayed | 3 |

---

## Epic 7: Games

| ID | Story | Phase |
|---|---|---|
| CAMP-100 | Manual game record: title, cover upload, genre tags, player count range | 1 |
| CAMP-101 | Game quick-add inline during poll option creation | 1 |
| CAMP-102 | "I own this" ownership toggle: per game, per platform | 1 |
| CAMP-103 | Remove ownership record | 1 |
| CAMP-104 | Ownership overlap on game poll options ("You + 2 others own this on PC") | 1 |
| CAMP-105 | Game page (group-scoped): cover, description, ownership list, poll history, trailer URL | 1 |
| CAMP-106 | My Games library page: full owned list, filter by platform, remove records | 1 |
| CAMP-107 | IGDB search and import: feature-flagged, background enrichment job, local storage on import | 2 |
| CAMP-108 | Steam account link via OpenID OAuth | 2 |
| CAMP-109 | Steam library sync job: background, respects Steam privacy, opt-in visibility toggle | 2 |
| CAMP-110 | Steam Store API: price snapshot at poll creation time | 2 |
| CAMP-111 | SteamSpy: player count, ownership estimate, avg playtime snapshot to `metadata_json` | 2 |
| CAMP-112 | Steam friend matching: cross-reference Steam friends with Campfire accounts | 2 |
| CAMP-113 | Game catalog search across full instance | 3 |
| CAMP-114 | Price history: store per-poll snapshot, display trend on game page | 3 |
| CAMP-115 | Profile gaming stats showcase: hours played, recently played (requires Steam link) | 3 |
| CAMP-116 | IGDB re-enrichment job for records older than 90 days | 3 |

---

## Epic 8: Notifications

| ID | Story | Phase |
|---|---|---|
| CAMP-120 | In-app notification centre: bell icon, unread count, mark read, mark all read | 0 |
| CAMP-121 | Email: friend request received | 0 |
| CAMP-122 | Email: friend request accepted | 0 |
| CAMP-123 | Email: group invite received | 0 |
| CAMP-124 | Email: poll opened (you have a vote pending) | 1 |
| CAMP-125 | Email: poll closed (results ready) | 1 |
| CAMP-126 | Email: event confirmed | 1 |
| CAMP-127 | Email: event cancelled | 1 |
| CAMP-128 | Email: RSVP reminder T-24h | 1 |
| CAMP-129 | Email: RSVP reminder T-1h | 1 |
| CAMP-130 | Email: feed digest (batched daily/weekly, not per-post) | 2 |
| CAMP-131 | Browser push notifications: Web Push API, service worker, opt-in prompt | 2 |

---

## Epic 9: Onboarding

| ID | Story | Phase |
|---|---|---|
| CAMP-140 | First-run flow step 1: set `@username` handle | 0 |
| CAMP-141 | First-run flow step 2: set display name, upload avatar (skippable) | 0 |
| CAMP-142 | First-run flow step 3: copy invite link (primary CTA) or search for friends (secondary) | 0 |
| CAMP-143 | Empty feed state: clear messaging + invite link CTA | 0 |
| CAMP-144 | First-run flow: Steam account link prompt (skippable) | 2 |

---

## Epic 10: Infrastructure & DevOps

| ID | Story | Phase |
|---|---|---|
| CAMP-150 | Docker Compose: dev environment (Mailhog, MinIO console, Drizzle Studio) | 0 |
| CAMP-151 | Docker Compose: production (Caddy, SMTP relay via env var, MinIO) | 0 |
| CAMP-152 | Database migrations via Drizzle Kit with inspectable SQL output | 0 |
| CAMP-153 | Seed script: users, friends, groups, posts, games for local dev | 0 |
| CAMP-154 | `.env.example` with all required variables documented | 0 |
| CAMP-155 | CI pipeline: lint, typecheck, Vitest unit tests (GitHub Actions) | 0 |
| CAMP-156 | Rate limiting middleware: search, registration, post submission | 0 |
| CAMP-157 | Image upload validation: type allowlist, size limit (5MB per image) | 0 |
| CAMP-158 | Backup/restore runbook for self-hosted instances | 3 |
| CAMP-159 | Health check endpoints (`/api/health`) | 3 |
| CAMP-160 | Structured JSON logging with configurable log level | 3 |
| CAMP-161 | Instance admin panel: user list, group list, system stats | 3 |
| CAMP-162 | Migration guide: self-hosted prototype → managed hosting | 3 |
