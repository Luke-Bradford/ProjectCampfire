# Product Brief

## What it is

ProjectCampfire is a private social planning platform for gaming friend groups. It replaces the fragmented coordination loop of Discord pings, WhatsApp threads, Steam chat, and random links that friends currently use to decide what to play and when. It adds a social layer — posts, reactions, reposts, game context — scoped entirely to your friend graph and your groups.

## What it is not

- Not a public social network
- Not a game store or price tracker
- Not a streaming or content platform
- Not a real-time chat application
- No public spaces, no anonymous users, no public content

Everything is invite-only and friend-graph-scoped.

---

## Core problem

Getting a friend group to agree on a game and a time requires checking multiple apps, pinging people individually, and still ending up with half the group forgetting. Existing tools split planning, game information, and discussion into separate places with no connection between them.

---

## Core value loop

1. You find friends on the platform via username search, invite link, or Steam friend matching.
2. You form a group. Members share their availability.
3. An organiser creates an event and runs polls: what to play, when, for how long.
4. Members vote. The organiser confirms. RSVPs go out automatically.
5. Between sessions, the activity feed is active: posts, images, link shares, reactions, reposts.
6. Before voting on a game, members can see who already owns it, the current price, player counts, and a trailer link.

---

## User personas

### The Organiser (primary)

**Profile:** 22–35, stable friend group of 4–10, plays PC games 3–5 sessions/month, currently wrangles the group via Discord DMs or a group chat.

**Pain:** Spends 20–30 minutes per week pinging people, aggregating availability, deciding on a game — and half the group still misses the session.

**Goal:** Know who is free, pick a game everyone can play, confirm a time, done.

**Why they adopt:** They carry the most coordination friction. Campfire directly reduces their own workload. They are the one who sets it up and invites the group.

### The Passive Member (secondary)

**Profile:** Same friend group. Doesn't manage anything. Just wants to show up and know what's happening.

**Pain:** Misses sessions because they didn't see the ping. Doesn't know what game was decided or what to install.

**Goal:** Be informed without having to ask.

**Why they stay:** The platform tells them what's happening without effort on their part.

---

## Initial wedge

Target: **the Organiser in a stable PC gaming friend group of 4–8 people** who already coordinates via Discord or WhatsApp and has felt the friction of that at least once a month.

The wedge is not "join a new network." It is "replace the coordination thread you hate."

Distribution in v1 is person-to-person invite within an existing social graph. The Organiser deploys, invites their group via a single link.

---

## MVP scope

The MVP must answer one question usefully: **"What are we playing, and when?"**

### In scope

- Email/password accounts with unique `@username` handles
- Open and private profile visibility modes
- Friend requests, friend lists, blocking
- Private groups (standard and private tiers)
- Availability blocks with group overlap view
- Session events with time polls, game polls, and standalone group polls
- RSVP with email confirmations and reminders
- Activity feed: text posts, images (up to 4), one link unfurl, reactions, reposts
- YouTube embedded player; all other URLs as rich preview cards
- 1,000 character post limit with live counter; post editing with edited marker
- Manual game records and "I own this" ownership toggle
- Ownership overlap shown on game poll options
- Discord server invite URL field on groups (link-out only, no integration)
- Email notifications via async queue
- Docker Compose self-hosted deployment

### Not in scope for MVP

- Steam account linking or game library sync
- External game metadata (IGDB, SteamSpy, Steam Store API)
- GIF support
- Browser push notifications
- OAuth login
- Real-time chat
- Public spaces or public content of any kind
- Mobile native apps

---

## Privacy model

**Profile visibility**

| Mode | Searchable | Repostable content | Add friend |
|---|---|---|---|
| `open` | Yes, by username | Yes | Anyone can send request |
| `private` | No | No | Requires specific invite link |

**Group visibility**

| Tier | Appears on member profiles | Joinable without invite |
|---|---|---|
| `standard` | Yes (name only, visible to friends of member) | No |
| `private` | No, invisible | No |

**Repost rules**

- Repost button is shown but greyed out and non-interactive if the original author's profile is `private`
- Server enforces this regardless of client state
- If an author switches to `private` after their content has been reposted, existing reposts suppress the original content at read time ("Content no longer available")
- Reposts cannot be reposted — a share always traces back to the original

**Blocking**

- If you blocked someone: their content appears as a placeholder ("Post from a blocked user") with a click-to-reveal and unblock option
- If they blocked you: you see the post author attribution but the content is hidden; you are not informed that a block exists

---

## Hosting model

Self-hosted during prototyping on the developer's own server for cost control. Before any public launch, migration to a managed hosting environment will be a clean fresh install — prototype data preservation is not required. The architecture is portable by design: Postgres, Redis, MinIO, Docker Compose — no vendor-managed services.

---

## Non-MVP features (future consideration)

- Steam account linking and library sync
- IGDB game metadata import
- SteamSpy popularity data and price snapshots
- GIF support in posts
- Browser push notifications
- OAuth login (Google, Discord)
- Recurring event templates
- Profile gaming stats showcase
- "Hot" feed ranking
- Price history tracking
- Mobile native apps
- Public game pages (not planned for v1)
- Public communities (not planned for v1)
