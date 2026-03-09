import { z } from "zod";
import { and, asc, desc, eq, isNull, lt, or, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { posts, comments, reactions, friendships, groupMemberships } from "@/server/db/schema";
import { assertRateLimit } from "@/server/ratelimit";

export const feedRouter = createTRPCRouter({
  // Unified feed: friends + groups, block-filtered, cursor-paginated (CAMP-096)
  // cursor encodes "<isoTimestamp>_<postId>" for stable tie-breaking when two posts share createdAt.
  // Condition: (createdAt < t) OR (createdAt = t AND id < id) — no posts silently skipped.
  list: protectedProcedure
    .input(z.object({ cursor: z.string().optional(), limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const me = ctx.user.id;

      // Parse compound cursor
      let cursorDate: Date | undefined;
      let cursorId: string | undefined;
      if (input.cursor) {
        const sep = input.cursor.lastIndexOf("_");
        cursorDate = new Date(input.cursor.slice(0, sep));
        cursorId = input.cursor.slice(sep + 1);
      }

      const [friendRows, blockedRows, memberRows] = await Promise.all([
        // Friends
        db
          .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId })
          .from(friendships)
          .where(
            and(
              or(eq(friendships.requesterId, me), eq(friendships.addresseeId, me)),
              eq(friendships.status, "accepted")
            )
          ),
        // Blocked users (both directions)
        db
          .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId })
          .from(friendships)
          .where(
            and(
              or(eq(friendships.requesterId, me), eq(friendships.addresseeId, me)),
              eq(friendships.status, "blocked")
            )
          ),
        // Groups I'm in
        db
          .select({ groupId: groupMemberships.groupId })
          .from(groupMemberships)
          .where(eq(groupMemberships.userId, me)),
      ]);

      const friendIds = friendRows.map((r) =>
        r.requesterId === me ? r.addresseeId : r.requesterId
      );
      const blockedIds = blockedRows.map((r) =>
        r.requesterId === me ? r.addresseeId : r.requesterId
      );
      const myGroupIds = memberRows.map((r) => r.groupId);

      // Build author filter: my own posts + friends + group posts, minus blocked
      const visibleAuthorIds = [me, ...friendIds].filter((id) => !blockedIds.includes(id));

      const feedPosts = await db.query.posts.findMany({
        where: and(
          isNull(posts.deletedAt),
          or(
            visibleAuthorIds.length > 0 ? inArray(posts.authorId, visibleAuthorIds) : undefined,
            myGroupIds.length > 0 ? inArray(posts.groupId, myGroupIds) : undefined
          ),
          // Compound cursor: (createdAt < t) OR (createdAt = t AND id < cursorId)
          cursorDate && cursorId
            ? or(
                lt(posts.createdAt, cursorDate),
                and(eq(posts.createdAt, cursorDate), lt(posts.id, cursorId))
              )
            : undefined
        ),
        orderBy: [desc(posts.createdAt)],
        limit: input.limit + 1,
        with: {
          author: { columns: { id: true, name: true, username: true, image: true } },
          group: { columns: { id: true, name: true } },
          reactions: { columns: { id: true, userId: true, type: true } },
          comments: {
            where: isNull(comments.deletedAt),
            orderBy: [asc(comments.createdAt)],
            limit: 20,
            with: {
              author: { columns: { id: true, name: true, username: true, image: true } },
              reactions: { columns: { id: true, userId: true, type: true } },
            },
          },
        },
      });

      const hasMore = feedPosts.length > input.limit;
      const items = hasMore ? feedPosts.slice(0, input.limit) : feedPosts;
      const last = items[items.length - 1];
      const nextCursor = hasMore && last ? `${last.createdAt.toISOString()}_${last.id}` : undefined;

      return { items, nextCursor };
    }),

  // Create a post (CAMP-080)
  create: protectedProcedure
    .input(
      z.object({
        body: z.string().min(1).max(1000),
        groupId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertRateLimit(`rl:feed:create:${ctx.user.id}`, 10, 60);
      const id = createId();
      await db.insert(posts).values({
        id,
        authorId: ctx.user.id,
        body: input.body,
        groupId: input.groupId ?? null,
        imageUrls: [],
      });
      return { id };
    }),

  // Soft-delete own post (CAMP-087)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const post = await db.query.posts.findFirst({
        where: and(eq(posts.id, input.id), eq(posts.authorId, ctx.user.id)),
        columns: { id: true },
      });
      if (!post) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, input.id));
    }),

  // Add a comment (CAMP-088)
  comment: protectedProcedure
    .input(z.object({ postId: z.string(), body: z.string().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const id = createId();
      await db.insert(comments).values({
        id,
        postId: input.postId,
        authorId: ctx.user.id,
        body: input.body,
      });
      return { id };
    }),

  // Edit own comment (CAMP-088)
  editComment: protectedProcedure
    .input(z.object({ id: z.string(), body: z.string().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const comment = await db.query.comments.findFirst({
        where: and(eq(comments.id, input.id), eq(comments.authorId, ctx.user.id), isNull(comments.deletedAt)),
        columns: { id: true },
      });
      if (!comment) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(comments)
        .set({ body: input.body, editedAt: new Date() })
        .where(eq(comments.id, input.id));
    }),

  // Delete own comment
  deleteComment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await db.query.comments.findFirst({
        where: and(eq(comments.id, input.id), eq(comments.authorId, ctx.user.id)),
        columns: { id: true },
      });
      if (!comment) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, input.id));
    }),

  // Toggle like on a post or comment (CAMP-089)
  toggleLike: protectedProcedure
    .input(
      z.union([
        z.object({ postId: z.string(), commentId: z.undefined().optional() }),
        z.object({ commentId: z.string(), postId: z.undefined().optional() }),
      ]).refine(
        (v) => Boolean(v.postId) !== Boolean(v.commentId),
        "Exactly one of postId or commentId must be provided"
      )
    )
    .mutation(async ({ ctx, input }) => {
      const targetCol = input.postId
        ? eq(reactions.postId, input.postId)
        : eq(reactions.commentId, input.commentId!);
      const existing = await db.query.reactions.findFirst({
        where: and(
          eq(reactions.userId, ctx.user.id),
          eq(reactions.type, "like"),
          targetCol
        ),
        columns: { id: true },
      });
      if (existing) {
        await db.delete(reactions).where(eq(reactions.id, existing.id));
        return { liked: false };
      }
      await db.insert(reactions).values({
        id: createId(),
        userId: ctx.user.id,
        postId: input.postId ?? null,
        commentId: input.commentId ?? null,
        type: "like",
      });
      return { liked: true };
    }),
});
