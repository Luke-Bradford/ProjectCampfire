---
name: schema-reference
description: Look up ProjectCampfire's database schema, table relationships, and Drizzle conventions. Use when asked about the data model, table structure, column names, or relationships between entities.
disable-model-invocation: false
user-invocable: true
---

ProjectCampfire database schema reference. Full details in [schema.md](schema.md).

## Quick reference — table names and primary relationships

| Table | Key columns | Notes |
|---|---|---|
| `user` | `id`, `email`, `name`, `image`, `username` | Singular. better-auth convention. All profile fields here. |
| `session` | `id`, `token`, `userId` | `token` field, not `sessionToken`. |
| `account` | `id`, `userId`, `providerId` | OAuth accounts (Phase 2). |
| `friendships` | `requesterId`, `addresseeId`, `status` | Composite PK. Status: pending/accepted/blocked. |
| `groups` | `id`, `name`, `visibility`, `inviteToken` | visibility: standard/private. |
| `group_memberships` | `groupId`, `userId`, `role` | Composite PK. role: owner/admin/member. |
| `posts` | `id`, `authorId`, `groupId`, `body`, `imageUrls`, `deletedAt` | `imageUrls text[]` defaults to `[]`. Soft delete. |
| `comments` | `id`, `postId`, `authorId`, `body`, `deletedAt` | Soft delete. |
| `reactions` | `id`, `userId`, `postId`, `commentId`, `type` | type: like. |
| `notifications` | `id`, `userId`, `type`, `data`, `readAt` | |
| `games` | `id`, `igdbId`, `title`, `coverUrl` | External metadata cache. |
| `events` | `id`, `groupId`, `createdBy`, `status` | status: draft/open/confirmed/cancelled. |
| `event_rsvps` | `eventId`, `userId`, `status` | Composite PK. status: yes/no/maybe. |
| `polls` | `id`, `eventId`, `groupId`, `type`, `status` | type: time_slot/game/duration/custom. |
| `poll_options` | `id`, `pollId`, `label`, `gameId`, `startsAt`, `endsAt` | |
| `poll_votes` | `pollOptionId`, `userId` | Composite PK. |
| `availability_schedules` | `id`, `userId` | Recurring weekly template. |
| `availability_overrides` | `id`, `userId`, `date` | Per-date tweaks. |

## Drizzle conventions for this project

- IDs: `text` (cuid2), never integer or UUID
- Timestamps: `timestamp` (not `timestamptz` — stored as UTC)
- Soft delete: `deletedAt timestamp` column, never hard delete for user content
- All schema files in `src/server/db/schema/`, exported via `src/server/db/schema/index.ts`
- Migrations in `drizzle/` (gitignored). Generate: `pnpm db:generate`. Apply: `pnpm db:migrate`.
- Table references: always use the Drizzle table object (e.g. `${posts}`) in `sql` templates — never string table names
- `sql.raw()` is never used with runtime values

For full column details see [schema.md](schema.md).
