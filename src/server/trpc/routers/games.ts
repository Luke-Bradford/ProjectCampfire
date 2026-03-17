import { z } from "zod";
import { and, asc, count, countDistinct, desc, eq, gt, ilike, inArray, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { games, gameOwnerships, groupMemberships, pollOptions, polls } from "@/server/db/schema";
import { assertRateLimit } from "@/server/ratelimit";
import {
  igdbEnabled,
  searchIgdbGames,
  fetchIgdbGame,
  normalizeCoverUrl,
  derivePlayerCounts,
  extractSteamAppId,
} from "@/server/igdb";
import { snapshotSteamSpyData } from "@/server/lib/steamspy";
import { logger } from "@/lib/logger";

const log = logger.child("games");

const PLATFORMS = ["pc", "playstation", "xbox", "nintendo", "other"] as const;

export const gamesRouter = createTRPCRouter({
  // Search IGDB for games by title (CAMP-107)
  // Returns lightweight result objects suitable for the import picker.
  // Only available when IGDB credentials are configured.
  igdbSearch: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      if (!igdbEnabled()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "IGDB is not configured." });
      }
      await assertRateLimit(`rl:igdb:search:${ctx.user.id}`, 20, 60);
      const results = await searchIgdbGames(input.query);
      return results.map((g) => ({
        igdbId: g.id,
        title: g.name,
        coverUrl: normalizeCoverUrl(g.cover?.url),
        genres: (g.genres ?? []).map((x) => x.name),
        steamAppId: extractSteamAppId(g),
        ...derivePlayerCounts(g),
      }));
    }),

  // Import a game from IGDB into the local catalog (CAMP-107)
  // Idempotent: if a game with the same externalId already exists, returns its id.
  importFromIgdb: protectedProcedure
    .input(z.object({ igdbId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      if (!igdbEnabled()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "IGDB is not configured." });
      }
      await assertRateLimit(`rl:igdb:import:${ctx.user.id}`, 10, 60);

      const igdbIdStr = String(input.igdbId);

      // Fast-path: return existing record (avoids unnecessary IGDB fetch)
      const existing = await db.query.games.findFirst({
        where: and(eq(games.externalSource, "igdb"), eq(games.externalId, igdbIdStr)),
        columns: { id: true },
      });
      if (existing) return { id: existing.id };

      // Fetch full game data from IGDB
      const igdbGame = await fetchIgdbGame(input.igdbId);
      if (!igdbGame) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Game not found on IGDB." });
      }

      const { minPlayers, maxPlayers } = derivePlayerCounts(igdbGame);
      const id = createId();

      // ON CONFLICT DO NOTHING: the unique partial index on (externalSource, externalId)
      // handles the race between two concurrent requests for the same game.
      // After the insert, re-fetch the id in case our insert lost the race.
      await db.insert(games).values({
        id,
        title: igdbGame.name,
        description: igdbGame.summary ?? null,
        coverUrl: normalizeCoverUrl(igdbGame.cover?.url),
        genres: (igdbGame.genres ?? []).map((g) => g.name),
        minPlayers,
        maxPlayers,
        externalSource: "igdb",
        externalId: igdbIdStr,
        steamAppId: extractSteamAppId(igdbGame),
        metadataJson: igdbGame,
      }).onConflictDoNothing();

      // Re-fetch in case our row lost to a concurrent insert
      const row = await db.query.games.findFirst({
        where: and(eq(games.externalSource, "igdb"), eq(games.externalId, igdbIdStr)),
        columns: { id: true },
      });

      const finalId = row?.id ?? id;

      // Fire-and-forget SteamSpy snapshot for games with a Steam app ID
      const steamAppId = extractSteamAppId(igdbGame);
      if (steamAppId) {
        void snapshotSteamSpyData(finalId, steamAppId).catch((err: unknown) =>
          log.error("steamspy snapshot failed", { gameId: finalId, err: String(err) }),
        );
      }

      return { id: finalId };
    }),

  // Search the game catalog by title (CAMP-062 quick-add support)
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      await assertRateLimit(`rl:games:search:${ctx.user.id}`, 30, 60);
      return db
        .select({
          id: games.id,
          title: games.title,
          coverUrl: games.coverUrl,
          minPlayers: games.minPlayers,
          maxPlayers: games.maxPlayers,
          genres: games.genres,
        })
        .from(games)
        .where(ilike(games.title, `%${input.query}%`))
        .limit(20);
    }),

  // Create a manual game record (CAMP-100)
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        minPlayers: z.number().int().min(1).optional(),
        maxPlayers: z.number().int().min(1).optional(),
        genres: z.array(z.string()).max(10).default([]),
      })
    )
    .mutation(async ({ input }) => {
      const id = createId();
      await db.insert(games).values({
        id,
        title: input.title,
        description: input.description ?? null,
        minPlayers: input.minPlayers ?? null,
        maxPlayers: input.maxPlayers ?? null,
        genres: input.genres,
        externalSource: "manual",
      });
      return { id };
    }),

  // Get a single game with ownership info for the current user
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const game = await db.query.games.findFirst({
        where: eq(games.id, input.id),
        with: { ownerships: { columns: { userId: true, platform: true, source: true } } },
      });
      if (!game) throw new TRPCError({ code: "NOT_FOUND" });
      const myPlatforms = game.ownerships
        .filter((o) => o.userId === ctx.user.id)
        .map((o) => o.platform);
      return { ...game, myPlatforms };
    }),

  // Toggle ownership for the current user on a platform (CAMP-102/103)
  toggleOwnership: protectedProcedure
    .input(z.object({ gameId: z.string(), platform: z.enum(PLATFORMS) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.query.gameOwnerships.findFirst({
        where: and(
          eq(gameOwnerships.userId, ctx.user.id),
          eq(gameOwnerships.gameId, input.gameId),
          eq(gameOwnerships.platform, input.platform)
        ),
      });
      if (existing) {
        await db
          .delete(gameOwnerships)
          .where(
            and(
              eq(gameOwnerships.userId, ctx.user.id),
              eq(gameOwnerships.gameId, input.gameId),
              eq(gameOwnerships.platform, input.platform)
            )
          );
        return { owned: false };
      }
      await db.insert(gameOwnerships).values({
        userId: ctx.user.id,
        gameId: input.gameId,
        platform: input.platform,
        source: "manual",
      });
      return { owned: true };
    }),

  // Insert-only ownership add — used by the catalog "Add to library" CTA.
  // Unlike toggleOwnership, this never deletes. Safe for double-clicks and stale cache.
  // onConflictDoNothing makes it idempotent.
  addToLibrary: protectedProcedure
    .input(z.object({ gameId: z.string(), platform: z.enum(PLATFORMS) }))
    .mutation(async ({ ctx, input }) => {
      const game = await db.query.games.findFirst({
        where: eq(games.id, input.gameId),
        columns: { id: true },
      });
      if (!game) throw new TRPCError({ code: "NOT_FOUND", message: "Game not found." });

      await db
        .insert(gameOwnerships)
        .values({
          userId: ctx.user.id,
          gameId: input.gameId,
          platform: input.platform,
          source: "manual",
        })
        // Specify conflict target explicitly so only the PK violation is silenced.
        // gameOwnerships PK is (userId, gameId, platform).
        .onConflictDoNothing({ target: [gameOwnerships.userId, gameOwnerships.gameId, gameOwnerships.platform] });

      return { owned: true };
    }),

  // My games library (CAMP-106, CAMP-118 pagination, CAMP-121 hide, CAMP-119 search)
  // Groups ownership by game so each game appears once regardless of platform count.
  // Cursor is gameId (lexicographic on the games table, stable).
  // showHidden=true returns only hidden games (for the "manage hidden" view).
  myGames: protectedProcedure
    .input(
      z.object({
        platform: z.enum(PLATFORMS).optional(),
        search: z.string().max(100).optional(),
        cursor: z.string().optional(), // last gameId from previous page
        limit: z.number().int().min(1).max(100).default(50),
        showHidden: z.boolean().default(false),
        sort: z.enum(["alphabetical", "most_played", "recently_played", "recently_added"]).default("alphabetical"),
      })
    )
    .query(async ({ ctx, input }) => {
      // If a search term is provided, resolve which gameIds match before filtering ownerships.
      let searchGameIds: string[] | undefined;
      const term = input.search?.trim() ?? "";
      if (term.length > 0) {
        // Escape LIKE metacharacters so user input is treated as a literal substring.
        const escaped = term.replace(/[%_\\]/g, "\\$&");
        const matchingGames = await db
          .select({ id: games.id })
          .from(games)
          .where(ilike(games.title, `%${escaped}%`))
          .orderBy(games.title);
        searchGameIds = matchingGames.map((g) => g.id);
        // If no games match the search, return early — no ownerships to fetch.
        if (searchGameIds.length === 0) return { items: [], nextCursor: undefined, total: 0 };
        // Guard: very common search terms can match thousands of catalog entries.
        // ORDER BY title above makes truncation deterministic (alphabetical prefix).
        // At MVP scale (Steam sync caps at ~2000 games/user) the IN clause is still
        // manageable, but this cap prevents unbounded query size.
        if (searchGameIds.length > 500) searchGameIds = searchGameIds.slice(0, 500);
      }

      const ownershipWhere = and(
        eq(gameOwnerships.userId, ctx.user.id),
        input.platform ? eq(gameOwnerships.platform, input.platform) : undefined,
        eq(gameOwnerships.hidden, input.showHidden),
        searchGameIds ? inArray(gameOwnerships.gameId, searchGameIds) : undefined
      );

      // Count distinct games (not ownership rows) in SQL — avoids fetching all IDs.
      const [countRow] = await db
        .select({ total: countDistinct(gameOwnerships.gameId) })
        .from(gameOwnerships)
        .where(ownershipWhere);
      const total = countRow?.total ?? 0;

      // Fetch ALL ownership rows for the user (matching filters) on every request —
      // including "Load more" — group by game client-side to collect platforms, then
      // slice the grouped list for the requested page.
      // TODO(tech-debt): replace with SQL GROUP BY + array_agg for large libraries.
      // Safe at MVP scale: Steam sync caps at ~2000 games per user and the full set
      // fits comfortably in a single round-trip at this size.

      // Sort order for the raw ownership query. Alphabetical needs the title, which comes
      // from the joined game row — re-sort in JS after grouping instead.
      let orderByClause;
      switch (input.sort) {
        case "most_played":
          // Nulls last: games with no playtime data appear at the end.
          orderByClause = [sql`${gameOwnerships.playtimeMinutes} DESC NULLS LAST`, asc(gameOwnerships.gameId)];
          break;
        case "recently_played":
          orderByClause = [sql`${gameOwnerships.lastPlayedAt} DESC NULLS LAST`, asc(gameOwnerships.gameId)];
          break;
        case "recently_added":
          orderByClause = [desc(gameOwnerships.createdAt), asc(gameOwnerships.gameId)];
          break;
        default: // alphabetical
          orderByClause = [asc(gameOwnerships.gameId)];
      }

      const allRows = await db.query.gameOwnerships.findMany({
        where: ownershipWhere,
        with: {
          game: {
            columns: {
              id: true,
              title: true,
              coverUrl: true,
              genres: true,
              minPlayers: true,
              maxPlayers: true,
            },
          },
        },
        orderBy: () => orderByClause,
      });

      // Group by gameId — collect platforms, track max playtime / most-recent lastPlayedAt
      // across all platforms (Steam only populates PC rows, but this is future-proof).
      const gameMap = new Map<string, {
        id: string; title: string; coverUrl: string | null;
        genres: string[]; minPlayers: number | null; maxPlayers: number | null;
        platforms: (typeof PLATFORMS)[number][]; source: string; hidden: boolean;
        playtimeMinutes: number | null; lastPlayedAt: Date | null;
      }>();
      for (const r of allRows) {
        const existing = gameMap.get(r.gameId);
        if (existing) {
          existing.platforms.push(r.platform);
          // Keep the maximum playtime and most-recent lastPlayedAt across platforms.
          if (r.playtimeMinutes != null && (existing.playtimeMinutes == null || r.playtimeMinutes > existing.playtimeMinutes)) {
            existing.playtimeMinutes = r.playtimeMinutes;
          }
          if (r.lastPlayedAt != null && (existing.lastPlayedAt == null || r.lastPlayedAt > existing.lastPlayedAt)) {
            existing.lastPlayedAt = r.lastPlayedAt;
          }
        } else {
          gameMap.set(r.gameId, {
            ...r.game,
            platforms: [r.platform],
            source: r.source,
            hidden: r.hidden,
            playtimeMinutes: r.playtimeMinutes ?? null,
            lastPlayedAt: r.lastPlayedAt ?? null,
          });
        }
      }

      // Apply cursor and limit to the deduplicated list.
      // All rows are fetched in one query and sliced in JS. The cursor (gameId) is
      // stable regardless of sort order — it identifies the last-seen item positionally.
      //
      // Known trade-off: a background Steam re-sync between page 1 and page 2 can shift
      // sort positions for most_played/recently_played/recently_added, which may cause a
      // game to appear on both pages or be skipped entirely. This is acceptable at MVP
      // scale (libraries are small, re-syncs are infrequent, and full-page refreshes are
      // the primary access pattern). A stable per-request snapshot would require storing
      // the sorted list server-side — not warranted at this stage.
      //
      // For alphabetical, re-sort by title after grouping (title requires the join).
      const allGames = input.sort === "alphabetical"
        ? [...gameMap.values()].sort((a, b) => a.title.localeCompare(b.title))
        : [...gameMap.values()];
      let startIdx = 0;
      if (input.cursor) {
        const cursorIdx = allGames.findIndex((g) => g.id === input.cursor);
        // If cursor game was deleted (hidden/removed between pages), return empty
        // to prevent re-fetching from the start and duplicating already-loaded items.
        if (cursorIdx === -1) return { items: [], nextCursor: undefined, total };
        startIdx = cursorIdx + 1;
      }
      const page = allGames.slice(startIdx, startIdx + input.limit + 1);
      const hasMore = page.length > input.limit;
      const items = page.slice(0, input.limit);
      const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

      return { items, nextCursor, total };
    }),

  // Hide/unhide a game from the library and poll suggestions (CAMP-121).
  // Sets hidden=true on all ownership rows for this user+game (across all platforms).
  setGameHidden: protectedProcedure
    .input(z.object({ gameId: z.string(), hidden: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(gameOwnerships)
        .set({ hidden: input.hidden })
        .where(
          and(
            eq(gameOwnerships.userId, ctx.user.id),
            eq(gameOwnerships.gameId, input.gameId)
          )
        );
    }),

  // Batch ownership overlap for multiple games within a group (CAMP-104).
  // Returns a map of gameId → list of { user, platform } for group members who own it.
  // Used by the poll card to annotate each game option without N+1 queries.
  ownershipOverlapBatch: protectedProcedure
    .input(z.object({ gameIds: z.array(z.string()).min(1).max(20), groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      const members = await db.query.groupMemberships.findMany({
        where: eq(groupMemberships.groupId, input.groupId),
        with: { user: { columns: { id: true, name: true, username: true } } },
      });
      const memberIds = members.map((m) => m.userId);
      if (!memberIds.includes(ctx.user.id)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // memberIds is guaranteed non-empty here (caller is a member).
      // inArray with an empty array would generate invalid SQL in PostgreSQL.
      const ownerships = await db.query.gameOwnerships.findMany({
        where: and(
          inArray(gameOwnerships.gameId, input.gameIds),
          inArray(gameOwnerships.userId, memberIds)
        ),
        with: { user: { columns: { id: true, name: true, username: true } } },
      });
      // Group by gameId
      const result: Record<string, { user: { id: string; name: string; username: string | null }; platform: string }[]> = {};
      for (const o of ownerships) {
        if (!result[o.gameId]) result[o.gameId] = [];
        result[o.gameId]!.push({ user: o.user, platform: o.platform });
      }
      return result;
    }),

  // Poll history for a game within a group (CAMP-105).
  // Returns polls (with event context) where any option references this gameId,
  // scoped to the given group. Sorted newest first.
  pollHistory: protectedProcedure
    .input(z.object({ gameId: z.string(), groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      const members = await db.query.groupMemberships.findMany({
        where: eq(groupMemberships.groupId, input.groupId),
      });
      const memberIds = members.map((m) => m.userId);
      if (!memberIds.includes(ctx.user.id)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Find poll options that reference this game
      const matchingOptions = await db.query.pollOptions.findMany({
        where: eq(pollOptions.gameId, input.gameId),
        columns: { pollId: true },
      });
      if (matchingOptions.length === 0) return [];

      const pollIds = [...new Set(matchingOptions.map((o) => o.pollId))];

      // Fetch those polls scoped to the group (via groupId or via their event's groupId)
      const allPolls = await db.query.polls.findMany({
        where: inArray(polls.id, pollIds),
        with: {
          event: { columns: { id: true, title: true, status: true, groupId: true } },
          options: {
            with: { votes: { columns: { userId: true } } },
            orderBy: (t, { asc }) => [asc(t.sortOrder)],
          },
          createdBy: { columns: { id: true, name: true } },
        },
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });

      // Filter to only polls that belong to the requested group
      // (a poll belongs to the group if poll.groupId matches, or if its event belongs to the group)
      return allPolls.filter(
        (poll) =>
          poll.groupId === input.groupId ||
          (poll.event && poll.event.groupId === input.groupId)
      );
    }),

  // Browse the instance-wide game catalog with optional title search (CAMP-085).
  // Returns paginated results with per-game owned status for the current user.
  // Cursor is gameId (lexicographic, stable across pages).
  catalog: protectedProcedure
    .input(
      z.object({
        search: z.string().max(100).optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(24),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertRateLimit(`rl:games:catalog:${ctx.user.id}`, 30, 60);

      const term = input.search?.trim() ?? "";
      // Escape LIKE metacharacters so user input is treated as a literal substring.
      // Use sql`` with an explicit ESCAPE clause so PostgreSQL honours the backslash
      // escaping — ilike() alone does not emit ESCAPE, making \% and \_ ineffective.
      const escaped = term.replace(/[%_\\]/g, "\\$&");
      const titleFilter = term.length > 0
        ? sql`${games.title} ILIKE ${"%" + escaped + "%"} ESCAPE '\\'`
        : undefined;

      const where = and(
        titleFilter,
        input.cursor ? gt(games.id, input.cursor) : undefined,
      );

      // Total matching games (without cursor filter so it stays consistent across pages)
      const totalWhere = titleFilter;
      const [countRow] = await db
        .select({ total: count(games.id) })
        .from(games)
        .where(totalWhere);
      const total = countRow?.total ?? 0;

      const rows = await db
        .select({
          id: games.id,
          title: games.title,
          coverUrl: games.coverUrl,
          genres: games.genres,
          minPlayers: games.minPlayers,
          maxPlayers: games.maxPlayers,
        })
        .from(games)
        .where(where)
        .orderBy(asc(games.id))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const items = rows.slice(0, input.limit);
      const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

      // Check which of these games the current user already owns
      const gameIds = items.map((g) => g.id);
      const ownedRows = gameIds.length > 0
        ? await db
            .select({ gameId: gameOwnerships.gameId })
            .from(gameOwnerships)
            .where(
              and(
                eq(gameOwnerships.userId, ctx.user.id),
                inArray(gameOwnerships.gameId, gameIds),
              )
            )
        : [];
      const ownedSet = new Set(ownedRows.map((r) => r.gameId));

      return {
        items: items.map((g) => ({ ...g, owned: ownedSet.has(g.id) })),
        nextCursor,
        total,
      };
    }),

  // Ownership overlap for a game within a group (CAMP-104)
  ownershipOverlap: protectedProcedure
    .input(z.object({ gameId: z.string(), groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Get all members of the group
      const members = await db.query.groupMemberships.findMany({
        where: eq(groupMemberships.groupId, input.groupId),
        with: { user: { columns: { id: true, name: true, username: true } } },
      });
      const memberIds = members.map((m) => m.userId);
      if (!memberIds.includes(ctx.user.id)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Get ownerships for this game among group members
      const ownerships = await db.query.gameOwnerships.findMany({
        where: and(
          eq(gameOwnerships.gameId, input.gameId),
          or(...memberIds.map((id) => eq(gameOwnerships.userId, id)))
        ),
        with: { user: { columns: { id: true, name: true, username: true } } },
      });
      return ownerships.map((o) => ({ user: o.user, platform: o.platform }));
    }),
});
