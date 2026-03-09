# ProjectCampfire — Full Schema Reference

Source of truth: `src/server/db/schema/`. This file is a human-readable summary.
When in doubt, read the actual Drizzle schema files.

---

## Auth tables (`src/server/db/schema/auth.ts`)

### `user`
better-auth user table extended with profile fields. Table name is singular.

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | cuid2 |
| `name` | `text` NOT NULL | Display name |
| `email` | `text` NOT NULL UNIQUE | |
| `email_verified` | `boolean` | |
| `image` | `text` | Avatar URL (processed webp after upload) |
| `created_at` | `timestamp` | |
| `updated_at` | `timestamp` | |
| `username` | `varchar(20)` UNIQUE | Nullable — Postgres allows multiple NULLs in unique index |
| `username_changed_at` | `timestamp` | 30-day cooldown enforced in tRPC |
| `bio` | `text` | Max 300 chars (enforced in tRPC) |
| `profile_visibility` | `enum` | `open` \| `private`, default `open` |
| `notification_prefs` | `jsonb` | `NotificationPrefs` type, default `{}` |
| `invite_token` | `varchar(64)` UNIQUE | For friend/group invites |
| `deleted_at` | `timestamp` | Soft delete |
| `pii_scrubbed` | `boolean` | Set by async scrub job after soft delete |

### `session`
| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | |
| `expires_at` | `timestamp` | |
| `token` | `text` UNIQUE | Session token field (not `sessionToken`) |
| `user_id` | `text` FK → `user.id` CASCADE | |
| `ip_address`, `user_agent` | `text` | |

### `account` (OAuth, Phase 2)
| Column | Notes |
|---|---|
| `user_id` FK → `user.id` CASCADE | |
| `provider_id`, `account_id` | OAuth provider identifier |
| `access_token`, `refresh_token`, `id_token` | |

### `verification`
Email verification and password reset tokens (managed by better-auth).

---

## Social tables (`src/server/db/schema/friendships.ts`)

### `friendships`
Composite PK: (`requester_id`, `addressee_id`)

| Column | Notes |
|---|---|
| `requester_id` FK → `user.id` CASCADE | Who sent the request |
| `addressee_id` FK → `user.id` CASCADE | Who received it |
| `status` | `pending` \| `accepted` \| `blocked` |

---

## Groups (`src/server/db/schema/groups.ts`)

### `groups`
| Column | Notes |
|---|---|
| `id` | cuid2 |
| `name` | varchar(100) |
| `description`, `avatar_url` | |
| `visibility` | `standard` \| `private` |
| `discord_invite_url` | Optional Discord link |
| `invite_token` | varchar(64) UNIQUE |

### `group_memberships`
Composite PK: (`group_id`, `user_id`)

| Column | Notes |
|---|---|
| `group_id` FK → `groups.id` CASCADE | |
| `user_id` FK → `user.id` CASCADE | |
| `role` | `owner` \| `admin` \| `member` |

---

## Feed (`src/server/db/schema/posts.ts`)

### `posts`
| Column | Notes |
|---|---|
| `id` | cuid2 |
| `author_id` FK → `user.id` CASCADE | |
| `group_id` FK → `groups.id` CASCADE | Nullable — personal post if null |
| `body` | varchar(1000), nullable |
| `image_urls` | `text[]` default `[]` — always initialised, never NULL |
| `embed_metadata` | `jsonb EmbedMetadata` — YouTube or link preview |
| `repost_of_id` | `text` — self-referential, no FK constraint |
| `pinned_at` | `timestamp` — set by group admin |
| `edited_at` | `timestamp` |
| `deleted_at` | `timestamp` — soft delete |

### `comments`
| Column | Notes |
|---|---|
| `post_id` FK → `posts.id` CASCADE | |
| `author_id` FK → `user.id` CASCADE | |
| `body` | varchar(1000) NOT NULL |
| `edited_at`, `deleted_at` | Soft delete |

### `reactions`
| Column | Notes |
|---|---|
| `user_id` FK → `user.id` CASCADE | |
| `post_id` FK → `posts.id` CASCADE | Nullable |
| `comment_id` FK → `comments.id` CASCADE | Nullable |
| `type` | `like` (only value currently) |

### `notifications`
| Column | Notes |
|---|---|
| `user_id` FK → `user.id` CASCADE | |
| `type` | `friend_request_received` \| `friend_request_accepted` \| `group_invite_received` |
| `data` | `jsonb` |
| `read_at` | `timestamp` |

---

## Games (`src/server/db/schema/games.ts`)

### `games`
External game metadata cache (IGDB, Steam, or manual entry).

| Column | Notes |
|---|---|
| `id` | cuid2 |
| `title` | NOT NULL |
| `cover_url` | Processed image URL |
| `min_players`, `max_players` | integer, nullable |
| `genres` | `text[]` default `[]` |
| `external_source` | `manual` \| `igdb` \| `steam_app` |
| `external_id`, `steam_app_id` | For deduplication |
| `metadata_json` | Raw API response cache |

### `game_ownerships`
Composite PK: (`user_id`, `game_id`, `platform`)

| Column | Notes |
|---|---|
| `user_id` FK → `user.id` CASCADE | |
| `game_id` FK → `games.id` CASCADE | |
| `platform` | `pc` \| `playstation` \| `xbox` \| `nintendo` \| `other` |
| `source` | `manual` \| `steam` |

---

## Events & Planning (`src/server/db/schema/events.ts`)

### `events`
| Column | Notes |
|---|---|
| `group_id` FK → `groups.id` CASCADE | |
| `created_by` FK → `user.id` | No cascade — keep event if creator leaves |
| `status` | `draft` \| `open` \| `confirmed` \| `cancelled` |
| `confirmed_starts_at`, `confirmed_ends_at` | Set when status → confirmed |

### `event_rsvps`
Composite PK: (`event_id`, `user_id`)

| Column | Notes |
|---|---|
| `status` | `yes` \| `no` \| `maybe` |
| `note` | Optional text |

### `polls`
| Column | Notes |
|---|---|
| `event_id` FK → `events.id` CASCADE | Nullable |
| `group_id` FK → `groups.id` CASCADE | Nullable |
| `type` | `time_slot` \| `game` \| `duration` \| `custom` |
| `allow_multiple_votes` | text "true"/"false" (not boolean — schema quirk) |
| `status` | `open` \| `closed` |

### `poll_options`
| Column | Notes |
|---|---|
| `poll_id` FK → `polls.id` CASCADE | |
| `game_id` FK → `games.id` SET NULL | For game polls |
| `starts_at`, `ends_at` | For time_slot polls |
| `sort_order` | integer default 0 |

### `poll_votes`
Composite PK: (`poll_option_id`, `user_id`)

---

## Availability (`src/server/db/schema/availability.ts`)

### `availability_schedules`
One per user (unique on `user_id`). Weekly recurring template.

| Column | Notes |
|---|---|
| `user_id` FK → `user.id` CASCADE UNIQUE | |
| `timezone` | text, default "UTC" |
| `slots` | `jsonb WeeklySlots` — `Record<dayOfWeek(0-6), TimeSlot[]>` |

### `availability_overrides`
Per-date tweaks. Unique on (`user_id`, `date`).

| Column | Notes |
|---|---|
| `date` | `date` string (YYYY-MM-DD) |
| `type` | `available` \| `busy` |
| `slots` | `jsonb TimeSlot[]` |
| `label` | Optional text |

### TypeScript types
```ts
type TimeSlot = {
  start: string;       // "HH:mm"
  end: string;         // "HH:mm"
  endDayOffset?: number; // 0 = same day, 1 = next day (overnight)
  type?: "available" | "busy"; // default "available"
  label?: string;
}

type WeeklySlots = Partial<Record<number, TimeSlot[]>>; // 0=Sun … 6=Sat
```
