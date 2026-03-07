# Roadmap

## Phase 0 — Foundation

**Goal:** Working auth, user handles, friend graph, groups, and a basic social feed. No planning features yet.

**Exit criterion:** A group of friends can register, find each other, form a group, and have a social conversation with image and link sharing.

### Deliverables

**Infrastructure**
- Monorepo scaffold: Next.js 15 + tRPC + Drizzle + Postgres + Redis
- Docker Compose: dev environment with Mailhog and MinIO console
- Docker Compose: production template with Caddy and SMTP relay
- CI pipeline: lint, typecheck, Vitest unit tests (GitHub Actions)
- Environment variable validation via `@t3-oss/env-nextjs`
- Database migrations via Drizzle Kit
- Seed script for local development

**Auth & Identity**
- Email/password registration with email verification
- Login, logout, session management via Lucia Auth + Redis
- Password reset via email token
- Unique `@username` handle with 30-day rename cooldown
- Profile: display name, avatar upload (MinIO), bio
- Profile visibility toggle: `open` / `private`
- Notification preferences in account settings
- Account soft-delete

**Friend Discovery & Connections**
- Username search (open profiles only, rate-limited)
- Direct profile URL `/u/[username]`
- Profile invite token: generate, share, join (reusable, no expiry)
- Invite link landing: auto-friend-request if registered; auto-accept on new signup
- Send, accept, decline, cancel friend request
- Friend list view
- Remove friend
- Block (asymmetric shadow filter) and unblock

**Groups**
- Create group: name, description, avatar, visibility (standard/private)
- Discord invite URL field (link-out only)
- Group invite link: generate and join
- Group membership roles: owner, admin, member
- Standard group visibility on member profile (to friends only)
- Leave group

**Activity Feed**
- Text post to friend feed or group feed (1,000 char limit, live counter)
- Up to 4 image uploads (BullMQ → Sharp → MinIO, async)
- One link unfurl per post (OG fetch via BullMQ, async)
- YouTube URLs: embedded player
- All other URLs: rich preview card (title, description, thumbnail)
- Post editing with "edited" timestamp
- Soft delete own post
- Comments (1,000 char limit, editable, soft-deleteable)
- Reactions (like) on posts and comments
- Reposts with server-side permission check (open profile authors only)
- Repost button greyed out for private-profile authors
- "Content no longer available" render state (deleted original or author went private)
- Event-scoped posts
- Pin post in group (admin)
- Unified feed: friends + groups, cursor-paginated, block-filtered, chronological

**Notifications**
- In-app notification centre (bell, unread count, mark read)
- Email: friend request received/accepted
- Email: group invite

**Onboarding**
- First-run flow: handle → display name → avatar → find friends or copy invite link
- Empty feed state with CTA

---

## Phase 1 — Core Planning Loop

**Goal:** The product answers "what are we playing and when?" end to end.

**Exit criterion:** An organiser can run a full session — poll to RSVP to reminder — without leaving the app. Validate this with a real friend group before starting Phase 2.

### Deliverables

**Availability**
- Add/edit/delete availability blocks (date/time range, label, visibility)
- Own availability calendar view
- Group availability overlap view: intersection of member blocks

**Session Planning**
- Create event: title, description, proposed time windows
- Time slot poll from proposed windows
- Game poll with game catalog search and inline quick-add
- Standalone group polls (not attached to an event)
- Multiple polls per event (time + game simultaneously)
- Voting UI: single and multi-select, live counts (refresh-based)
- Close poll manually or via BullMQ scheduled job
- Confirm event: select winning options, set status = confirmed
- Cancel event

**RSVP & Reminders**
- RSVP: yes / no / maybe
- RSVP via email link (signed token, no re-login required)
- Event detail page: poll results, RSVP list
- Event reminders: BullMQ jobs at T-24h and T-1h

**Games**
- Manual game record: title, cover upload, genre tags, player count range
- Game quick-add inline during poll creation
- "I own this" toggle per game per platform
- Remove ownership record
- Ownership overlap on game poll options ("You + 2 others own this on PC")
- Game page (group-scoped): cover, description, ownership within group, polls
- My Games library page: full owned list, filter by platform

**Notifications (planning types)**
- Email: poll opened
- Email: poll closed (results ready)
- Email: event confirmed
- Email: RSVP reminder T-24h and T-1h
- Email: event cancelled

---

## Phase 2 — Game Context & Platform Enrichment

**Goal:** Game metadata supports planning decisions. Steam enriches ownership data. Platform is more complete for onboarding non-technical users.

**Exit criterion:** Members see who owns a game enriched with Steam data; game pages show enough context for a confident vote.

### Deliverables

**Game Metadata**
- IGDB integration (feature-flagged, graceful degradation):
  - Search by title, import: cover, genres, player count, Steam App ID, trailer URL
  - Background enrichment job — never live in the request path
  - All data stored locally in Postgres on import
- Steam Store API: price snapshot at poll creation time
- SteamSpy API: player count, ownership estimate, avg playtime (snapshotted to `metadata_json`)
- Game page: price snapshot, player count, review summary, trailer link

**Steam Integration**
- Steam account link via OpenID OAuth
- Steam library sync job (background, respects Steam privacy settings)
- Steam visibility opt-in toggle on profile settings
- Steam friend matching: show existing Campfire users from Steam friends list
- Steam friend invite: single-use 14-day targeted invite link

**Auth**
- OAuth login: Google
- OAuth login: Discord

**Feed**
- GIF support in posts (stored as image, 10MB limit)

**Notifications**
- Browser push notifications (Web Push API, service worker, opt-in)
- Email: feed digest (batched daily/weekly)

**Onboarding**
- Steam account link prompt in first-run flow (skippable)

---

## Phase 3 — Polish, Reliability & Growth

**Goal:** Production-hardened, pleasant to use, and ready for wider deployment including non-technical users.

### Deliverables

**Planning**
- Recurring event templates ("every Friday at 8pm")
- Event history and past session log per group

**Group Admin**
- Remove member (admin/owner)
- Transfer group ownership
- Archive group

**Feed**
- "Hot" feed ranking (engagement-weighted, time-decayed — only after sufficient data exists)

**Profile**
- Gaming stats showcase: hours played, recently played, achievement count (requires Steam link)

**Games**
- Game catalog search across full instance
- Price history: store per-poll snapshot, display trend on game page
- IGDB re-enrichment job for records older than 90 days

**Infrastructure**
- Backup/restore runbook for self-hosted instances
- Health check endpoints (`/api/health`)
- Structured logging (JSON, configurable log level)
- Instance admin panel: user list, group list, system stats
- Rate limiting hardening: group size caps, invite link expiry controls
- Migration guide: self-hosted prototype → managed hosting
- Hosted deployment option for non-technical organisers
