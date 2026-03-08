import { z } from "zod";
import { and, eq, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { games, gameOwnerships } from "@/server/db/schema";

const PLATFORMS = ["pc", "playstation", "xbox", "nintendo", "other"] as const;

export const gamesRouter = createTRPCRouter({
  // Search the game catalog by title (CAMP-062 quick-add support)
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ input }) => {
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

  // My games library (CAMP-106)
  myGames: protectedProcedure
    .input(z.object({ platform: z.enum(PLATFORMS).optional() }))
    .query(async ({ ctx, input }) => {
      const rows = await db.query.gameOwnerships.findMany({
        where: and(
          eq(gameOwnerships.userId, ctx.user.id),
          input.platform ? eq(gameOwnerships.platform, input.platform) : undefined
        ),
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
      });
      return rows.map((r) => ({ ...r.game, platform: r.platform, source: r.source }));
    }),

  // Ownership overlap for a game within a group (CAMP-104)
  ownershipOverlap: protectedProcedure
    .input(z.object({ gameId: z.string(), groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Get all members of the group
      const { groupMemberships } = await import("@/server/db/schema");
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
