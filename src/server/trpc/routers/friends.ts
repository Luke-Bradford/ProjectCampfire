import { z } from "zod";
import { and, countDistinct, eq, gt, ilike, inArray, isNull, ne, notExists, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { randomBytes } from "crypto";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { user, friendships, friendInvites, notifications, groupMemberships, groups, gameOwnerships } from "@/server/db/schema";
import { enqueueFriendRequest, enqueueFriendRequestAccepted } from "@/server/jobs/email-jobs";
import { enqueuePush } from "@/server/jobs/push-jobs";
import { assertRateLimit } from "@/server/ratelimit";
import { env } from "@/env";
import { logger } from "@/lib/logger";

const log = logger.child("friends");

export const friendsRouter = createTRPCRouter({
  // Search open-profile users by username or display name (CAMP-020)
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(50) }))
    .query(async ({ ctx, input }) => {
      await assertRateLimit(`rl:friends:search:${ctx.user.id}`, 30, 60);
      const term = `%${input.query}%`;
      return db
        .select({
          id: user.id,
          name: user.name,
          username: user.username,
          image: user.image,
          status: user.status,
        })
        .from(user)
        .where(
          and(
            ne(user.id, ctx.user.id),
            eq(user.profileVisibility, "open"),
            or(ilike(user.username, term), ilike(user.name, term))
          )
        )
        .limit(20);
    }),

  // Send a friend request (CAMP-024)
  sendRequest: protectedProcedure
    .input(z.object({ addresseeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.addresseeId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot add yourself." });
      }
      // Check if a row already exists in either direction
      const existing = await db.query.friendships.findFirst({
        where: or(
          and(eq(friendships.requesterId, ctx.user.id), eq(friendships.addresseeId, input.addresseeId)),
          and(eq(friendships.requesterId, input.addresseeId), eq(friendships.addresseeId, ctx.user.id))
        ),
      });
      if (existing) {
        if (existing.status === "blocked") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Action not allowed." });
        }
        throw new TRPCError({ code: "CONFLICT", message: "Friend request already exists." });
      }
      await db.insert(friendships).values({
        requesterId: ctx.user.id,
        addresseeId: input.addresseeId,
        status: "pending",
      });
      // Notify the addressee (CAMP-121)
      await db.insert(notifications).values({
        id: createId(),
        userId: input.addresseeId,
        type: "friend_request_received",
        data: { requesterId: ctx.user.id, requesterName: ctx.user.name },
      });
      void enqueueFriendRequest({ requesterName: ctx.user.name ?? "Someone", recipientUserId: input.addresseeId })
        .catch((err: unknown) => log.error("enqueueFriendRequest failed", { err: String(err) }));
      void enqueuePush(input.addresseeId, {
        title: "New friend request",
        body: `${ctx.user.name ?? "Someone"} sent you a friend request.`,
        url: "/friends",
      }).catch((err: unknown) => log.error("enqueuePush(friendRequest) failed", { err: String(err) }));
    }),

  // Accept or decline a pending request (CAMP-025)
  respondToRequest: protectedProcedure
    .input(z.object({ requesterId: z.string(), accept: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const row = await db.query.friendships.findFirst({
        where: and(
          eq(friendships.requesterId, input.requesterId),
          eq(friendships.addresseeId, ctx.user.id),
          eq(friendships.status, "pending")
        ),
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Request not found." });
      }
      if (input.accept) {
        await db
          .update(friendships)
          .set({ status: "accepted", updatedAt: new Date() })
          .where(
            and(
              eq(friendships.requesterId, input.requesterId),
              eq(friendships.addresseeId, ctx.user.id)
            )
          );
        // Notify the original requester (CAMP-122)
        await db.insert(notifications).values({
          id: createId(),
          userId: input.requesterId,
          type: "friend_request_accepted",
          data: { acceptorId: ctx.user.id, acceptorName: ctx.user.name },
        });
        void enqueueFriendRequestAccepted({ acceptorName: ctx.user.name ?? "Someone", recipientUserId: input.requesterId })
          .catch((err: unknown) => log.error("enqueueFriendRequestAccepted failed", { err: String(err) }));
        void enqueuePush(input.requesterId, {
          title: "Friend request accepted",
          body: `${ctx.user.name ?? "Someone"} accepted your friend request.`,
          url: "/friends",
        }).catch((err: unknown) => log.error("enqueuePush(friendRequestAccepted) failed", { err: String(err) }));
      } else {
        await db
          .delete(friendships)
          .where(
            and(
              eq(friendships.requesterId, input.requesterId),
              eq(friendships.addresseeId, ctx.user.id)
            )
          );
      }
    }),

  // Cancel an outgoing pending request (CAMP-025)
  cancelRequest: protectedProcedure
    .input(z.object({ addresseeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(friendships)
        .where(
          and(
            eq(friendships.requesterId, ctx.user.id),
            eq(friendships.addresseeId, input.addresseeId),
            eq(friendships.status, "pending")
          )
        );
    }),

  // List friends and incoming requests (CAMP-026)
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.query.friendships.findMany({
      where: or(
        eq(friendships.requesterId, ctx.user.id),
        eq(friendships.addresseeId, ctx.user.id)
      ),
      with: {
        requester: { columns: { id: true, name: true, username: true, image: true, status: true } },
        addressee: { columns: { id: true, name: true, username: true, image: true, status: true } },
      },
    });

    const friends = rows
      .filter((r) => r.status === "accepted")
      .map((r) => (r.requesterId === ctx.user.id ? r.addressee : r.requester));

    const incoming = rows
      .filter((r) => r.status === "pending" && r.addresseeId === ctx.user.id)
      .map((r) => r.requester);

    const outgoing = rows
      .filter((r) => r.status === "pending" && r.requesterId === ctx.user.id)
      .map((r) => r.addressee);

    return { friends, incoming, outgoing };
  }),

  // Remove a friend (CAMP-027)
  remove: protectedProcedure
    .input(z.object({ friendId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(friendships)
        .where(
          or(
            and(eq(friendships.requesterId, ctx.user.id), eq(friendships.addresseeId, input.friendId)),
            and(eq(friendships.requesterId, input.friendId), eq(friendships.addresseeId, ctx.user.id))
          )
        );
    }),

  // Block a user (CAMP-028)
  block: protectedProcedure
    .input(z.object({ targetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Delete any existing friendship row in either direction, then insert blocked
      await db
        .delete(friendships)
        .where(
          or(
            and(eq(friendships.requesterId, ctx.user.id), eq(friendships.addresseeId, input.targetId)),
            and(eq(friendships.requesterId, input.targetId), eq(friendships.addresseeId, ctx.user.id))
          )
        );
      await db.insert(friendships).values({
        requesterId: ctx.user.id,
        addresseeId: input.targetId,
        status: "blocked",
      });
    }),

  // List users blocked by the current user (CAMP-028/029)
  listBlocked: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.query.friendships.findMany({
      where: and(
        eq(friendships.requesterId, ctx.user.id),
        eq(friendships.status, "blocked")
      ),
      with: {
        addressee: { columns: { id: true, name: true, username: true, image: true } },
      },
    });
    return rows.map((r) => r.addressee);
  }),

  // Unblock (CAMP-029)
  unblock: protectedProcedure
    .input(z.object({ targetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(friendships)
        .where(
          and(
            eq(friendships.requesterId, ctx.user.id),
            eq(friendships.addresseeId, input.targetId),
            eq(friendships.status, "blocked")
          )
        );
    }),

  // Fetch a public profile by username (CAMP-021)
  // Open profiles return full data; private profiles return name only.
  getProfile: publicProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ input }) => {
      const found = await db.query.user.findFirst({
        where: eq(user.username, input.username),
        columns: {
          id: true,
          name: true,
          username: true,
          image: true,
          bio: true,
          profileVisibility: true,
          status: true,
        },
      });
      if (!found) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }
      if (found.profileVisibility === "private") {
        return { id: found.id, name: found.name, username: found.username, image: null, bio: null, profileVisibility: "private" as const };
      }
      return found;
    }),

  // Return standard groups for a user's profile — visible to friends only (CAMP-044)
  getProfileGroups: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Must be a friend to see groups
      const friendship = await db.query.friendships.findFirst({
        where: and(
          or(
            and(eq(friendships.requesterId, ctx.user.id), eq(friendships.addresseeId, input.userId)),
            and(eq(friendships.requesterId, input.userId), eq(friendships.addresseeId, ctx.user.id))
          ),
          eq(friendships.status, "accepted")
        ),
        columns: { requesterId: true },
      });
      if (!friendship) return [];

      // Return standard (non-private) groups the target user belongs to.
      // visibility filter is in the DB query — private group names never touch server memory.
      const rows = await db
        .select({ id: groups.id, name: groups.name })
        .from(groupMemberships)
        .innerJoin(groups, and(eq(groups.id, groupMemberships.groupId), eq(groups.visibility, "standard")))
        .where(eq(groupMemberships.userId, input.userId));
      return rows;
    }),

  // Resolve an invite token to a public profile — no auth required (CAMP-023)
  resolveInviteToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const found = await db.query.user.findFirst({
        where: eq(user.inviteToken, input.token),
        columns: { id: true, name: true, username: true, image: true },
      });
      if (!found) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite link not found or has been regenerated." });
      }
      return found;
    }),

  // Send a friend request via invite token — requires auth (CAMP-022)
  sendRequestViaToken: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const found = await db.query.user.findFirst({
        where: eq(user.inviteToken, input.token),
        columns: { id: true },
      });
      if (!found) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite link not found or has been regenerated." });
      }
      if (found.id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot add yourself." });
      }
      const existing = await db.query.friendships.findFirst({
        where: or(
          and(eq(friendships.requesterId, ctx.user.id), eq(friendships.addresseeId, found.id)),
          and(eq(friendships.requesterId, found.id), eq(friendships.addresseeId, ctx.user.id))
        ),
      });
      if (existing) {
        if (existing.status === "blocked") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Action not allowed." });
        }
        throw new TRPCError({ code: "CONFLICT", message: "Already friends or request pending." });
      }
      await db.insert(friendships).values({
        requesterId: ctx.user.id,
        addresseeId: found.id,
        status: "pending",
      });
      await db.insert(notifications).values({
        id: createId(),
        userId: found.id,
        type: "friend_request_received",
        data: { requesterId: ctx.user.id, requesterName: ctx.user.name },
      });
      void enqueueFriendRequest({ requesterName: ctx.user.name ?? "Someone", recipientUserId: found.id })
        .catch((err: unknown) => log.error("enqueueFriendRequest failed", { err: String(err) }));
      void enqueuePush(found.id, {
        title: "New friend request",
        body: `${ctx.user.name ?? "Someone"} sent you a friend request.`,
        url: "/friends",
      }).catch((err: unknown) => log.error("enqueuePush(friendRequest) failed", { err: String(err) }));
    }),

  // Return a user's public game library — visible only when their profile is open (CAMP-115).
  // Returns up to `limit` games (default 12) plus the total count.
  getProfileGames: protectedProcedure
    .input(z.object({ userId: z.string(), limit: z.number().int().min(1).max(50).default(12) }))
    .query(async ({ ctx, input }) => {
      await assertRateLimit(`rl:profile:games:${ctx.user.id}`, 30, 60);
      // Only show games for open profiles
      const profile = await db.query.user.findFirst({
        where: eq(user.id, input.userId),
        columns: { profileVisibility: true },
      });
      if (!profile || profile.profileVisibility !== "open") {
        return { items: [], total: 0 };
      }

      // Count distinct games (not ownership rows) — a game owned on multiple platforms
      // produces multiple rows, so countDistinct avoids inflating the total.
      const [countRow] = await db
        .select({ total: countDistinct(gameOwnerships.gameId) })
        .from(gameOwnerships)
        .where(and(eq(gameOwnerships.userId, input.userId), eq(gameOwnerships.hidden, false)));
      const total = countRow?.total ?? 0;

      // Fetch cover art for the first `limit` games (one row per ownership, dedupe in JS)
      const rows = await db.query.gameOwnerships.findMany({
        where: and(eq(gameOwnerships.userId, input.userId), eq(gameOwnerships.hidden, false)),
        with: { game: { columns: { id: true, title: true, coverUrl: true } } },
        orderBy: (t, { asc }) => [asc(t.gameId)],
        // Fetch up to limit+50 to allow JS-side dedup to fill `limit` unique games
        limit: input.limit + 50,
      });

      // Deduplicate by gameId (a game owned on multiple platforms has one row per platform).
      // Note: fetching limit+50 rows covers the common case but may yield fewer than `limit`
      // unique games if the user owns many games on 3+ platforms. Acceptable at MVP scale.
      const seen = new Set<string>();
      const items: { id: string; title: string; coverUrl: string | null }[] = [];
      for (const r of rows) {
        if (seen.has(r.gameId)) continue;
        seen.add(r.gameId);
        // Guard against orphaned ownership rows (FK to a deleted game)
        if (!r.game) continue;
        items.push(r.game);
        if (items.length >= input.limit) break;
      }

      return { items, total };
    }),

  // ── Steam friend invites (CAMP-031) ───────────────────────────────────────────

  // Create a single-use, 14-day invite link optionally targeted at a Steam friend.
  // Rate-limited to 20 per hour to prevent invite spam.
  createSteamInvite: protectedProcedure
    .input(
      z.object({
        // The Steam ID of the intended recipient (optional).
        // If provided, the UI can show a personalised message.
        targetSteamId: z.string().regex(/^\d{17}$/).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertRateLimit(`rl:friends:invite:${ctx.user.id}`, 20, 3600);

      const token = randomBytes(32).toString("hex"); // 64 hex chars
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

      await db.insert(friendInvites).values({
        token,
        inviterId: ctx.user.id,
        targetSteamId: input.targetSteamId ?? null,
        expiresAt,
      });

      return { token };
    }),

  // Resolve an invite token to the inviter's public profile — no auth required.
  // Returns NOT_FOUND for expired or already-used tokens so the UI can show a clear message.
  resolveInviteLink: publicProcedure
    .input(z.object({ token: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const invite = await db.query.friendInvites.findFirst({
        where: and(
          eq(friendInvites.token, input.token),
          gt(friendInvites.expiresAt, new Date()),
          isNull(friendInvites.usedAt),
        ),
        with: {
          inviter: { columns: { id: true, name: true, username: true, image: true } },
        },
      });
      if (!invite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite link not found, expired, or already used." });
      }
      return {
        inviter: invite.inviter,
        expiresAt: invite.expiresAt,
      };
    }),

  // Accept an invite link — sends a friend request and marks the token as used.
  // Single-use: enforced by a WHERE usedAt IS NULL on the UPDATE. If the UPDATE
  // affects zero rows (token was consumed by a concurrent request), bail with CONFLICT
  // before inserting the friendship row.
  acceptInviteLink: protectedProcedure
    .input(z.object({ token: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      // isNull(usedAt) is included in the WHERE so used tokens return NOT_FOUND
      // rather than requiring a JS check. The real single-use enforcement is the
      // .returning() check on the UPDATE below; this is an early-exit optimisation.
      const invite = await db.query.friendInvites.findFirst({
        where: and(
          eq(friendInvites.token, input.token),
          gt(friendInvites.expiresAt, new Date()),
          isNull(friendInvites.usedAt),
        ),
        columns: { token: true, inviterId: true },
      });
      if (!invite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite link not found, expired, or already used." });
      }
      if (invite.inviterId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot accept your own invite." });
      }

      // Check for an existing friendship row in either direction
      const existing = await db.query.friendships.findFirst({
        where: or(
          and(eq(friendships.requesterId, ctx.user.id), eq(friendships.addresseeId, invite.inviterId)),
          and(eq(friendships.requesterId, invite.inviterId), eq(friendships.addresseeId, ctx.user.id))
        ),
      });
      if (existing) {
        if (existing.status === "blocked") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Action not allowed." });
        }
        throw new TRPCError({ code: "CONFLICT", message: "Already friends or request pending." });
      }

      // Mark token as consumed atomically. WHERE usedAt IS NULL ensures only one concurrent
      // caller wins. Check the returning result — if empty, another request consumed it first.
      const now = new Date();
      const consumed = await db
        .update(friendInvites)
        .set({ usedAt: now, usedBy: ctx.user.id })
        .where(and(eq(friendInvites.token, input.token), isNull(friendInvites.usedAt)))
        .returning({ token: friendInvites.token });
      if (consumed.length === 0) {
        throw new TRPCError({ code: "CONFLICT", message: "This invite link has already been used." });
      }

      await db.insert(friendships).values({
        requesterId: ctx.user.id,
        addresseeId: invite.inviterId,
        status: "pending",
      });
      await db.insert(notifications).values({
        id: createId(),
        userId: invite.inviterId,
        type: "friend_request_received",
        data: { requesterId: ctx.user.id, requesterName: ctx.user.name },
      });
      void enqueueFriendRequest({ requesterName: ctx.user.name ?? "Someone", recipientUserId: invite.inviterId })
        .catch((err: unknown) => log.error("enqueueFriendRequest failed", { err: String(err) }));
      void enqueuePush(invite.inviterId, {
        title: "New friend request",
        body: `${ctx.user.name ?? "Someone"} sent you a friend request.`,
        url: "/friends",
      }).catch((err: unknown) => log.error("enqueuePush(friendRequest) failed", { err: String(err) }));
    }),

  // Find Campfire users who are also on the caller's Steam friends list (CAMP-030/112).
  // Returns up to 50 users who have the same Steam ID as someone in the caller's
  // Steam friends list, excluding existing friends and pending requests.
  // Returns an empty list (not an error) if:
  //   - the caller has no Steam account linked
  //   - STEAM_API_KEY is not configured
  //   - the caller's Steam profile is private (GetFriendList returns 401)
  steamSuggestions: protectedProcedure.query(async ({ ctx }) => {
    await assertRateLimit(`rl:friends:steam:${ctx.user.id}`, 5, 60);

    if (!env.STEAM_API_KEY) return [];

    // Load caller's Steam ID
    const me = await db.query.user.findFirst({
      where: eq(user.id, ctx.user.id),
      columns: { steamId: true },
    });
    if (!me?.steamId) return [];

    // Fetch Steam friends list
    const url = new URL("https://api.steampowered.com/ISteamUser/GetFriendList/v1/");
    url.searchParams.set("key", env.STEAM_API_KEY);
    url.searchParams.set("steamid", me.steamId);
    url.searchParams.set("relationship", "friend");

    let steamFriendIds: string[];
    try {
      const res = await fetch(url);
      if (!res.ok) {
        // 401 = private profile; 500 = steam error. Both are silent no-ops.
        log.warn("GetFriendList failed", { status: res.status, userId: ctx.user.id });
        return [];
      }
      const json = (await res.json()) as {
        friendslist?: { friends?: { steamid: string }[] };
      };
      // Filter to valid Steam64 IDs (17-digit numeric strings) to guard against
      // malformed or missing steamid fields in the response.
      const STEAM_ID_RE = /^\d{17}$/;
      steamFriendIds = (json.friendslist?.friends ?? [])
        .map((f) => f.steamid)
        .filter((id): id is string => typeof id === "string" && STEAM_ID_RE.test(id));
    } catch (err) {
      log.warn("GetFriendList fetch error", { userId: ctx.user.id, err: String(err) });
      return [];
    }

    if (steamFriendIds.length === 0) return [];

    // Find Campfire users who have any of these Steam IDs, atomically excluding
    // any user who already has a friendship row in either direction. Using NOT EXISTS
    // rather than two sequential queries eliminates the race window where a friendship
    // created between the two queries could cause a user to appear in suggestions.
    const meId = ctx.user.id;
    return db
      .select({ id: user.id, name: user.name, username: user.username, image: user.image })
      .from(user)
      .where(
        and(
          ne(user.id, meId),
          inArray(user.steamId, steamFriendIds),
          notExists(
            db
              .select({ _: sql`1` })
              .from(friendships)
              .where(
                or(
                  and(eq(friendships.requesterId, meId), eq(friendships.addresseeId, user.id)),
                  and(eq(friendships.requesterId, user.id), eq(friendships.addresseeId, meId)),
                )
              )
          ),
        )
      )
      .limit(50);
  }),
});
