# Domain Model

## Entity definitions

### User

The central entity. Every other entity is owned by or relates to a user.

```
User
  id                  uuid (PK)
  username            text (unique, lowercase, 3–20 chars, alphanumeric + underscore)
  email               text (unique)
  password_hash       text
  display_name        text
  avatar_url          text (nullable — MinIO path)
  bio                 text (nullable)
  profile_visibility  enum: open | private
  username_changed_at timestamptz (nullable — 30-day rename cooldown)
  settings            jsonb (notification preferences, timezone)
  created_at          timestamptz
  deleted_at          timestamptz (nullable — soft delete)
```

**Profile visibility rules:**
- `open`: user is searchable by username, content is repostable, friend requests can arrive from anyone
- `private`: not searchable, not repostable, requires specific invite link to send a friend request

**Username rules:**
- Unique platform-wide, case-insensitive
- 30-day cooldown after a rename (enforced via `username_changed_at`)
- Old username is held for 30 days before becoming available again

---

### FriendInviteToken

Invite tokens for friend discovery. Separate from User to support multiple token types and full revocation visibility.

```
FriendInviteToken
  id               uuid (PK)
  owner_id         uuid -> User
  token            text (unique, generated)
  type             enum: profile | steam_targeted
  target_steam_id  text (nullable — only for steam_targeted type)
  single_use       bool
  used_at          timestamptz (nullable)
  expires_at       timestamptz (nullable — profile tokens don't expire; Steam targeted ones do)
  created_at       timestamptz
```

**Profile token** (`type = profile`): reusable, no expiry, invalidated only when the user regenerates it. Used to share a friend link in Discord/WhatsApp/etc.

**Steam targeted token** (`type = steam_targeted`): single-use, 14-day expiry, issued per Steam friend. When followed, auto-creates the friendship after registration.

---

### Friendship

Self-referential many-to-many on User. Models friend requests, accepted friendships, and blocks.

```
Friendship
  id            uuid (PK)
  requester_id  uuid -> User
  addressee_id  uuid -> User
  status        enum: pending | accepted | blocked
  created_at    timestamptz
  updated_at    timestamptz
  UNIQUE (requester_id, addressee_id)
```

**Block direction:** `requester_id` is always the blocker when `status = blocked`. This directional record is what determines asymmetric display behaviour at read time.

**Asymmetric block display:**

| Scenario | Display |
|---|---|
| You (`requester`) blocked them (`addressee`) | Their content shows as placeholder: "Post from a blocked user" — click to reveal, click to unblock |
| They (`requester`) blocked you (`addressee`) | Their post shows author name/avatar but content is hidden — you are not informed a block exists |

---

### Group

The primary container for shared planning and conversation.

```
Group
  id                 uuid (PK)
  name               text
  description        text (nullable)
  avatar_url         text (nullable)
  owner_id           uuid -> User
  invite_code        text (unique, uuid — the join link token)
  visibility         enum: standard | private
  discord_invite_url text (nullable — link-out only, no integration)
  created_at         timestamptz
```

**Visibility tiers:**

| Tier | On member profiles | Discoverable | Content visible to non-members |
|---|---|---|---|
| `standard` | Yes (name + avatar, to friends of the member only) | No | No |
| `private` | No | No | No |

For `standard` groups, a non-member who is friends with a member can see: group name, avatar, member count, and only the members who are also their friends. Nothing more.

---

### GroupMembership

```
GroupMembership
  group_id   uuid -> Group
  user_id    uuid -> User
  role       enum: owner | admin | member
  joined_at  timestamptz
  PK: (group_id, user_id)
```

---

### AvailabilityBlock

A time range a user marks themselves as free. Used to drive the group overlap view.

```
AvailabilityBlock
  id          uuid (PK)
  user_id     uuid -> User
  group_id    uuid -> Group (nullable — null means applies to all groups / friend context)
  starts_at   timestamptz
  ends_at     timestamptz
  label       text (nullable — e.g. "free after work")
  visibility  enum: friends | group | private
  created_at  timestamptz
```

**Invariant:** `ends_at` must be after `starts_at`.

---

### Event

A planned gaming session within a group.

```
Event
  id                   uuid (PK)
  group_id             uuid -> Group
  title                text
  description          text (nullable)
  created_by           uuid -> User
  status               enum: draft | open | confirmed | cancelled
  confirmed_starts_at  timestamptz (nullable — only set when status = confirmed)
  confirmed_ends_at    timestamptz (nullable)
  created_at           timestamptz
```

**Status transitions:**
```
draft → open → confirmed
             → cancelled
open  → cancelled
```

---

### EventRSVP

```
EventRSVP
  event_id  uuid -> Event
  user_id   uuid -> User
  status    enum: yes | no | maybe
  note      text (nullable)
  PK: (event_id, user_id)
```

---

### Poll

Can be attached to an event (time/game poll for that session) or standalone (any group question).

```
Poll
  id                   uuid (PK)
  event_id             uuid -> Event (nullable)
  group_id             uuid -> Group (nullable — required if event_id is null)
  type                 enum: time_slot | game | duration | custom
  question             text
  allow_multiple_votes bool
  closes_at            timestamptz (nullable — triggers auto-close job when set)
  status               enum: open | closed
  created_by           uuid -> User
  created_at           timestamptz
```

**Invariant:** At least one of `event_id` or `group_id` must be non-null.

---

### PollOption

```
PollOption
  id          uuid (PK)
  poll_id     uuid -> Poll
  label       text
  game_id     uuid -> Game (nullable — links option to a game record for overlap display)
  sort_order  integer
```

---

### PollVote

```
PollVote
  poll_option_id  uuid -> PollOption
  user_id         uuid -> User
  PK: (poll_option_id, user_id)
```

Unique per user per option. For multi-vote polls, a user can have multiple rows (one per option they selected).

---

### Game

The platform's local game catalog. Populated manually or enriched from external sources (Phase 2). External data is always copied locally — the app never depends on live API availability.

```
Game
  id               uuid (PK)
  title            text
  cover_url        text (nullable — MinIO path or external URL from IGDB)
  description      text (nullable)
  min_players      integer (nullable)
  max_players      integer (nullable)
  genres           text[]
  external_source  enum: manual | igdb | steam_app
  external_id      text (nullable — IGDB ID or Steam App ID)
  steam_app_id     text (nullable — populated in Phase 2 for Steam ownership matching)
  metadata_json    jsonb (price snapshots, player counts, SteamSpy data — Phase 2)
  created_at       timestamptz
  updated_at       timestamptz
```

---

### GameOwnership

```
GameOwnership
  user_id   uuid -> User
  game_id   uuid -> Game
  platform  enum: pc | playstation | xbox | nintendo | other
  source    enum: manual | steam
  PK: (user_id, game_id, platform)
```

**Invariant:** `source = steam` is only writable by the Steam sync worker, never by direct user API calls.

---

### Post

The core social content unit. Supports original posts and reposts.

```
Post
  id              uuid (PK)
  author_id       uuid -> User
  group_id        uuid -> Group (nullable — null = friend-feed post, not group-scoped)
  event_id        uuid -> Event (nullable — scoped to event discussion)
  body            text (max 1,000 characters — enforced by DB check constraint)
  image_urls      text[] (max 4 entries)
  embed_url       text (nullable — the URL to unfurl)
  embed_metadata  jsonb (nullable — title, description, thumbnail_url, embed_type)
  repost_of_id    uuid -> Post (nullable — null means original post)
  edited_at       timestamptz (nullable — set on any edit)
  created_at      timestamptz
  deleted_at      timestamptz (nullable — soft delete)
```

**Repost invariants:**
- `repost_of_id` must reference a post where `repost_of_id IS NULL` (no repost chains)
- A repost cannot be created if the original author's `profile_visibility = 'private'` (enforced server-side)
- If the original author later sets `profile_visibility = 'private'`, the repost content is suppressed at read time
- If the original post is soft-deleted, the repost content is suppressed at read time

**embed_type values:** `link` | `youtube` | `image`
YouTube URLs receive an embedded player. All other URLs receive a rich preview card (title, description, thumbnail). Video files are not uploadable.

---

### Comment

```
Comment
  id          uuid (PK)
  post_id     uuid -> Post
  author_id   uuid -> User
  body        text (max 1,000 characters)
  edited_at   timestamptz (nullable)
  created_at  timestamptz
  deleted_at  timestamptz (nullable)
```

---

### Reaction

Polymorphic reactions on posts and comments.

```
Reaction
  id           uuid (PK)
  entity_type  enum: post | comment
  entity_id    uuid
  user_id      uuid -> User
  reaction     enum: like
  created_at   timestamptz
  UNIQUE (entity_type, entity_id, user_id, reaction)
```

`entity_id` references either `posts.id` or `comments.id` depending on `entity_type`. Additional reaction types can be added to the enum later.

---

### Notification

```
Notification
  id          uuid (PK)
  user_id     uuid -> User
  type        enum (see below)
  payload     jsonb (type-specific data for rendering)
  read_at     timestamptz (nullable)
  created_at  timestamptz
```

**Notification types:**

| Type | Trigger |
|---|---|
| `friend_request_received` | Someone sent you a request |
| `friend_request_accepted` | Your request was accepted |
| `group_invite` | You were invited to a group |
| `poll_opened` | A poll was opened in a group you're in |
| `poll_closed` | A poll you voted in (or were eligible for) has closed |
| `event_confirmed` | An event you were involved in is confirmed |
| `event_cancelled` | A confirmed event was cancelled |
| `rsvp_reminder_24h` | 24 hours before a confirmed event you RSVPd yes/maybe to |
| `rsvp_reminder_1h` | 1 hour before the same |
| `post_reaction` | Someone reacted to your post |
| `post_comment` | Someone commented on your post |
| `post_repost` | Someone reposted your post |
| `feed_digest` | Batched daily/weekly summary (not per-post) |

---

## Relationships summary

```
User ──< Friendship >── User              (self-referential, directional for blocks)
User ──< FriendInviteToken               (one-to-many)
User ──< GroupMembership >── Group        (many-to-many with role)
Group ──< Event
Event ──< Poll
Group ──< Poll                            (standalone polls; event_id is null)
Poll ──< PollOption ──< PollVote >── User
Event ──< EventRSVP >── User
Group ──< Post
Post ──< Comment
Post ──< Reaction                         (polymorphic via entity_type)
Comment ──< Reaction                      (polymorphic via entity_type)
Post.repost_of_id ──> Post               (one level only)
User ──< AvailabilityBlock
User ──< GameOwnership >── Game
PollOption.game_id ──> Game              (nullable)
User ──< Notification
```

---

## Database constraints and invariants

| Rule | Enforcement |
|---|---|
| `Post.body` max 1,000 characters | `CHECK (char_length(body) <= 1000)` on the posts table |
| `Post.image_urls` max 4 items | Application-layer validation before insert |
| No repost chains | Application-layer: reject if `repost_of_id` target itself has `repost_of_id IS NOT NULL` |
| Repost requires open-profile author | Server-side check; UI also reflects with greyed button |
| `Poll` must have `event_id` or `group_id` | `CHECK (event_id IS NOT NULL OR group_id IS NOT NULL)` |
| `AvailabilityBlock.ends_at > starts_at` | `CHECK (ends_at > starts_at)` |
| `GameOwnership.source = steam` not user-writable | API layer rejects `source = steam` from user-facing procedures |
| `Event.confirmed_starts_at` only set on confirm | Application-layer state machine |
| Username 30-day rename cooldown | `username_changed_at` checked before allow; updated on rename |
| Soft deletes only | `deleted_at` timestamp; no hard deletes in the request path |

---

## Indexes

Key indexes to create at migration time:

```sql
-- Feed query performance
CREATE INDEX idx_posts_author_created ON posts (author_id, created_at DESC);
CREATE INDEX idx_posts_group_created  ON posts (group_id, created_at DESC);
CREATE INDEX idx_posts_deleted        ON posts (deleted_at) WHERE deleted_at IS NULL;

-- Friend lookup
CREATE INDEX idx_friendships_requester ON friendships (requester_id, status);
CREATE INDEX idx_friendships_addressee ON friendships (addressee_id, status);

-- Group membership
CREATE INDEX idx_memberships_user ON group_memberships (user_id);

-- Availability overlap
CREATE INDEX idx_availability_user_time ON availability_blocks (user_id, starts_at, ends_at);

-- Notifications
CREATE INDEX idx_notifications_user_unread ON notifications (user_id, read_at) WHERE read_at IS NULL;

-- Game search (full-text)
CREATE INDEX idx_games_fts ON games USING gin(to_tsvector('english', title));

-- User search (full-text)
CREATE INDEX idx_users_fts ON users USING gin(to_tsvector('english', username || ' ' || display_name));
```
