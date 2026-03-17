import { z } from "zod";
import { and, asc, desc, eq, gt, isNull, lt, or, inArray, not, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { posts, comments, reactions, notifications, friendships, groupMemberships, events, groups } from "@/server/db/schema";
import { assertRateLimit } from "@/server/ratelimit";
import { enqueueOgFetch } from "@/server/jobs/og-fetch-jobs";
import { enqueueProcessCommentImage } from "@/server/jobs/image-jobs";
import { enqueuePush } from "@/server/jobs/push-jobs";
import { logger } from "@/lib/logger";

const log = logger.child("feed");

export const feedRouter = createTRPCRouter({
  // Unified feed: friends + groups, block-filtered, cursor-paginated (CAMP-096)
  // cursor encodes "<isoTimestamp>_<postId>" for stable tie-breaking when two posts share createdAt.
  // Condition: (createdAt < t) OR (createdAt = t AND id < id) — no posts silently skipped.
  //
  // filter:
  //   "all"         — default: everything visible to the user (friends + groups)
  //   "friends"     — posts from direct friends only (no group-scoped posts)
  //   "group:<id>"  — posts scoped to a specific group (caller must be a member)
  list: protectedProcedure
    .input(z.object({
      cursor: z.string().optional(),
      limit: z.number().min(1).max(50).default(20),
      // "all" | "friends" | "group:<id>" — defaults to "all" when absent
      filter: z.string().optional(),
      // "new" (default, chronological cursor-paginated) | "hot" (score-ranked, top 50, no cursor)
      sort: z.enum(["new", "hot"]).default("new"),
    }))
    .query(async ({ ctx, input }) => {
      const me = ctx.user.id;

      // Parse compound cursor "<isoTimestamp>_<postId>" — only used for sort=new
      let cursorDate: Date | undefined;
      let cursorId: string | undefined;
      if (input.sort === "new" && input.cursor) {
        const sep = input.cursor.lastIndexOf("_");
        if (sep === -1) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid cursor" });
        cursorDate = new Date(input.cursor.slice(0, sep));
        cursorId = input.cursor.slice(sep + 1);
        if (isNaN(cursorDate.getTime()) || !cursorId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid cursor" });
        }
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

      // Parse and validate filter param
      const filter = input.filter ?? "all";
      if (filter !== "all" && filter !== "friends" && !filter.startsWith("group:")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid filter value." });
      }
      const groupFilter = filter.startsWith("group:") ? filter.slice(6) : null;

      // Authorise group filter — caller must be a member and groupId must be non-empty
      if (groupFilter !== null) {
        if (!groupFilter || !myGroupIds.includes(groupFilter)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this group." });
        }
      }

      // Build the visibility filter based on the selected tab:
      //   all     → own posts + friends' posts + posts in my groups, minus blocked
      //   friends → own posts + friends' posts with no groupId, minus blocked
      //   group:x → posts in that specific group, minus blocked (membership verified above)
      const visibleAuthorIds = [me, ...friendIds].filter((id) => !blockedIds.includes(id));
      // Defensive: if data corruption caused `me` to appear in blockedIds, visibleAuthorIds
      // would be empty. Return early to avoid generating `IN ()` which is invalid SQL.
      if (filter === "friends" && visibleAuthorIds.length === 0) {
        return { items: [], nextCursor: undefined };
      }
      // Excluded-author clause applied to all tabs to honour block relationships
      const blockedExclusion = blockedIds.length > 0
        ? not(inArray(posts.authorId, blockedIds))
        : undefined;

      const visibilityFilter = groupFilter
        ? and(eq(posts.groupId, groupFilter), blockedExclusion)
        : filter === "friends"
          // isNull(posts.groupId) scopes to non-group posts only (direct feed).
          ? and(inArray(posts.authorId, visibleAuthorIds), isNull(posts.groupId))
          : and(
              or(
                visibleAuthorIds.length > 0 ? inArray(posts.authorId, visibleAuthorIds) : undefined,
                myGroupIds.length > 0 ? inArray(posts.groupId, myGroupIds) : undefined
              ),
              blockedExclusion
            );

      // ── Hot ranking (sort=hot) ────────────────────────────────────────────────
      // HN-style score: (reactions + comments*2) / (age_hours + 2)^1.5
      // Strategy: fetch candidate post IDs (last 30 days, visibility-filtered) using
      // Drizzle's query builder, then join engagement counts in a single aggregation
      // query. Score + sort in JS, re-fetch top 50 with full relations.
      // No cursor: always returns the top 50 posts ranked by score.
      if (input.sort === "hot") {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // Step 1: candidate post IDs within the visibility window.
        // Capped at 1000 most-recent to avoid unbounded IN-list parameters downstream.
        // Hot scoring over the 1000 most-recent visible posts is a good-enough approximation
        // at MVP scale; truly viral older posts naturally decay below newer ones anyway.
        const candidateRows = await db
          .select({ id: posts.id, createdAt: posts.createdAt })
          .from(posts)
          .where(and(isNull(posts.deletedAt), visibilityFilter, gt(posts.createdAt, thirtyDaysAgo)))
          .orderBy(desc(posts.createdAt))
          .limit(1000);

        if (candidateRows.length === 0) return { items: [], nextCursor: undefined };

        const candidateIds = candidateRows.map((r) => r.id);

        // Step 2: engagement counts for all candidates in one query
        const engagementRows = await db
          .select({
            postId: reactions.postId,
            reactionCount: sql<number>`COUNT(*)`.mapWith(Number),
          })
          .from(reactions)
          .where(inArray(reactions.postId, candidateIds))
          .groupBy(reactions.postId);

        const commentCountRows = await db
          .select({
            postId: comments.postId,
            commentCount: sql<number>`COUNT(*)`.mapWith(Number),
          })
          .from(comments)
          .where(and(inArray(comments.postId, candidateIds), isNull(comments.deletedAt)))
          .groupBy(comments.postId);

        const reactionMap = new Map(engagementRows.map((r) => [r.postId, r.reactionCount]));
        const commentMap = new Map(commentCountRows.map((r) => [r.postId, r.commentCount]));

        // Step 3: score each candidate and pick top 50
        const now = Date.now();
        const scored = candidateRows
          .map((r) => {
            const reactionCount = reactionMap.get(r.id) ?? 0;
            const commentCount = commentMap.get(r.id) ?? 0;
            const ageHours = (now - r.createdAt.getTime()) / 3_600_000;
            const score = (reactionCount + commentCount * 2) / Math.pow(ageHours + 2, 1.5);
            return { id: r.id, score };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 50);

        const topIds = scored.map((r) => r.id);
        if (topIds.length === 0) return { items: [], nextCursor: undefined };

        const hotPosts = await db.query.posts.findMany({
          where: inArray(posts.id, topIds),
          with: {
            author: { columns: { id: true, name: true, username: true, image: true } },
            group: { columns: { id: true, name: true } },
            event: { columns: { id: true, title: true } },
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

        // Re-apply score order (findMany does not guarantee input order)
        const idOrder = new Map(topIds.map((id, i) => [id, i]));
        hotPosts.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

        return { items: hotPosts, nextCursor: undefined };
      }

      // ── Chronological (sort=new) ──────────────────────────────────────────────
      const feedPosts = await db.query.posts.findMany({
        where: and(
          isNull(posts.deletedAt),
          visibilityFilter,
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
          event: { columns: { id: true, title: true } },
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

  // Edit own post body (CAMP-086)
  // Single UPDATE with ownership + soft-delete check to avoid TOCTOU.
  editPost: protectedProcedure
    .input(z.object({ id: z.string(), body: z.string().trim().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(posts)
        .set({ body: input.body, editedAt: new Date() })
        .where(and(eq(posts.id, input.id), eq(posts.authorId, ctx.user.id), isNull(posts.deletedAt)))
        .returning({ id: posts.id });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
    }),

  // Create a post (CAMP-080, CAMP-094)
  // groupId and eventId are mutually exclusive: eventId resolves its own groupId server-side,
  // so supplying both would create an ambiguity. Enforce this at the schema level.
  create: protectedProcedure
    .input(
      z.object({
        // body is required unless a GIF is attached (GIF-only posts have body = "").
        body: z.string().max(1000).default(""),
        groupId: z.string().optional(),
        // eventId: scopes the post to a specific event's discussion thread (CAMP-094).
        // The event must belong to a group the caller is a member of.
        // Mutually exclusive with groupId — eventId resolves its own groupId server-side.
        eventId: z.string().optional(),
        // imageKeys: raw MinIO keys returned by /api/upload/post-image, one per image slot.
        // Pattern: posts/{userId}/{uploadId}/{cuid}-raw
        // userId: mixed-case alphanumeric (better-auth format). uploadId/cuid: lowercase alphanumeric (cuid2).
        // Shape validated by regex; ownership verified by prefix check in the mutation.
        imageKeys: z
          .array(z.string().regex(/^posts\/[A-Za-z0-9]+\/[A-Za-z0-9]{10,}\/[a-z0-9]+-raw$/))
          .max(4)
          .optional(),
        // gifUrl: a Tenor CDN URL selected via the GIF picker.
        // Stored directly in imageUrls (no MinIO processing needed — it's an external URL).
        // Mutually exclusive with imageKeys: one post has either uploaded images or one GIF.
        gifUrl: z.string().url().regex(/^https:\/\/media\.tenor\.com\//).optional(),
      }).refine(
        (v) => v.body.trim().length > 0 || !!v.gifUrl || !!v.imageKeys?.length,
        { message: "Post must have body text, a GIF, or at least one image." }
      ).refine(
        (v) => !(v.groupId && v.eventId),
        { message: "groupId and eventId are mutually exclusive" }
      ).refine(
        (v) => !(v.gifUrl && v.imageKeys?.length),
        { message: "gifUrl and imageKeys are mutually exclusive" }
      )
    )
    .mutation(async ({ ctx, input }) => {
      // Verify all imageKeys belong to the calling user (prefix = posts/{userId}/).
      // Prevents User A from attaching User B's uploaded images to their own post.
      if (input.imageKeys?.length) {
        const prefix = `posts/${ctx.user.id}/`;
        const alien = input.imageKeys.find((k) => !k.startsWith(prefix));
        if (alien) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Image does not belong to you." });
        }
      }

      // Authz: verify the caller is a member of the target group.
      // For event-scoped posts: groupId is inferred from the event.
      // For group-scoped posts: groupId is supplied directly — membership still checked.
      let resolvedGroupId: string | null = null;
      if (input.eventId) {
        const event = await db.query.events.findFirst({
          where: eq(events.id, input.eventId),
          columns: { groupId: true },
        });
        if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
        const membership = await db.query.groupMemberships.findFirst({
          where: and(
            eq(groupMemberships.groupId, event.groupId),
            eq(groupMemberships.userId, ctx.user.id)
          ),
          columns: { groupId: true },
        });
        if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this group." });
        resolvedGroupId = event.groupId;
      } else if (input.groupId) {
        const membership = await db.query.groupMemberships.findFirst({
          where: and(
            eq(groupMemberships.groupId, input.groupId),
            eq(groupMemberships.userId, ctx.user.id)
          ),
          columns: { groupId: true },
        });
        if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this group." });
        resolvedGroupId = input.groupId;
      }

      await assertRateLimit(`rl:feed:create:${ctx.user.id}`, 10, 60);

      // Reject new posts in archived groups
      if (resolvedGroupId) {
        const group = await db.query.groups.findFirst({
          where: eq(groups.id, resolvedGroupId),
          columns: { archivedAt: true },
        });
        if (group?.archivedAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This group is archived." });
        }
      }
      const id = createId();
      await db.insert(posts).values({
        id,
        authorId: ctx.user.id,
        body: input.body,
        groupId: resolvedGroupId,
        eventId: input.eventId ?? null,
        // GIF URL stored directly — no worker processing needed (external CDN URL).
        imageUrls: input.gifUrl ? [input.gifUrl] : [],
      });
      // Enqueue processing for any uploaded images. Each key was already uploaded to MinIO
      // by the /api/upload/post-image route before the post was created.
      if (input.imageKeys?.length) {
        const { enqueueProcessPostImage } = await import("@/server/jobs/image-jobs");
        await Promise.all(
          input.imageKeys.map((key, index) => enqueueProcessPostImage(id, key, index))
        );
      }
      // Detect the first URL in the post body and enqueue OG tag fetch.
      // Post is visible immediately; embedMetadata populates asynchronously.
      // Only one URL per post (one embed per product spec).
      // Trailing punctuation commonly appended in prose (., ), ;, etc.) is stripped.
      // Fire-and-forget: a Redis/queue failure must not fail the post creation itself.
      // (?<![='"]) negative lookbehind: skip URLs that appear inside HTML attribute
      // values (e.g. src="https://..." in pasted iframe code).
      const urlMatch = /(?<![='"])https?:\/\/[^\s<>"]+/i.exec(input.body);
      if (urlMatch) {
        const cleanUrl = urlMatch[0].replace(/[).,;:!?\]]+$/, "");
        enqueueOgFetch(id, cleanUrl).catch((err: unknown) => {
          log.error("failed to enqueue OG fetch", { postId: id, err: String(err) });
        });
      }
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
    .input(z.object({
      postId: z.string(),
      body: z.string().min(1).max(1000),
      // imageKeys: raw MinIO keys returned by /api/upload/post-image (same route).
      // Max 1 image per comment. Pattern: posts/{userId}/{uploadId}/{cuid}-raw
      // Ownership verified by prefix check (same as post images).
      imageKeys: z
        .array(z.string().regex(/^posts\/[A-Za-z0-9]+\/[A-Za-z0-9]{10,}\/[a-z0-9]+-raw$/))
        .max(1)
        .optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the post exists and is not soft-deleted.
      const post = await db.query.posts.findFirst({
        where: and(eq(posts.id, input.postId), isNull(posts.deletedAt)),
        columns: { id: true, authorId: true },
      });
      if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found." });

      if (input.imageKeys?.length) {
        const prefix = `posts/${ctx.user.id}/`;
        const alien = input.imageKeys.find((k) => !k.startsWith(prefix));
        if (alien) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Image does not belong to you." });
        }
      }
      const id = createId();
      await db.insert(comments).values({
        id,
        postId: input.postId,
        authorId: ctx.user.id,
        body: input.body,
        // Only set imageUrls placeholder when images are expected — avoids storing [] on text-only comments.
        imageUrls: input.imageKeys?.length ? [] : undefined,
      });
      if (input.imageKeys?.length) {
        await Promise.all(
          input.imageKeys.map((key, index) => enqueueProcessCommentImage(id, key, index))
        );
      }
      // Notify the post author if they are not the commenter (CAMP-163).
      // Fire-and-forget: a notification failure must not roll back the comment insert.
      // commenterName is denormalised at creation time — reflects the name at the time of the comment.
      if (post.authorId !== ctx.user.id) {
        db.insert(notifications).values({
          id: createId(),
          userId: post.authorId,
          type: "post_comment",
          data: { commenterId: ctx.user.id, commenterName: ctx.user.name, postId: input.postId, commentId: id },
        }).catch((err: unknown) => log.error("notification insert(postComment) failed", { err: String(err) }));
        void enqueuePush(post.authorId, {
          title: "New comment",
          body: `${ctx.user.name ?? "Someone"} commented on your post.`,
          url: `/feed/${input.postId}`,
        }).catch((err: unknown) => log.error("enqueuePush(postComment) failed", { err: String(err) }));
      }
      return { id };
    }),

  // Edit own comment (CAMP-088)
  // Single UPDATE with ownership + soft-delete check to avoid TOCTOU between check and write.
  editComment: protectedProcedure
    .input(z.object({ id: z.string(), body: z.string().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(comments)
        .set({ body: input.body, editedAt: new Date() })
        .where(and(eq(comments.id, input.id), eq(comments.authorId, ctx.user.id), isNull(comments.deletedAt)))
        .returning({ id: comments.id });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
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

  // List posts scoped to a specific event (CAMP-094).
  // Caller must be a member of the event's group.
  // Returns posts newest-first; pinned posts float to the top within the group.
  listForEvent: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ ctx, input }) => {
      const event = await db.query.events.findFirst({
        where: eq(events.id, input.eventId),
        columns: { groupId: true },
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      const membership = await db.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.groupId, event.groupId),
          eq(groupMemberships.userId, ctx.user.id)
        ),
        columns: { groupId: true },
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      return db.query.posts.findMany({
        where: and(eq(posts.eventId, input.eventId), isNull(posts.deletedAt)),
        // Pinned posts first, then newest.
        orderBy: [desc(posts.pinnedAt), desc(posts.createdAt)],
        with: {
          author: { columns: { id: true, name: true, username: true, image: true } },
          group: { columns: { id: true, name: true } },
          event: { columns: { id: true, title: true } },
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
    }),

  // Pin/unpin a post in its group (CAMP-095).
  // Only group admins (owner or admin role) may pin. The post must belong to a group.
  // Toggle: pinned → unpinned, unpinned → pinned.
  pinPost: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const post = await db.query.posts.findFirst({
        where: and(eq(posts.id, input.id), isNull(posts.deletedAt)),
        columns: { id: true, groupId: true, pinnedAt: true },
      });
      if (!post) throw new TRPCError({ code: "NOT_FOUND" });
      if (!post.groupId) throw new TRPCError({ code: "BAD_REQUEST", message: "Post is not in a group." });

      const membership = await db.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.groupId, post.groupId),
          eq(groupMemberships.userId, ctx.user.id)
        ),
        columns: { role: true },
      });
      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only group admins can pin posts." });
      }

      const newPinnedAt = post.pinnedAt ? null : new Date();
      await db.update(posts).set({ pinnedAt: newPinnedAt }).where(eq(posts.id, input.id));
      return { pinned: newPinnedAt !== null };
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

      // Notify the target's author on a new like — not on unlike, not self-like (CAMP-163).
      // Fire-and-forget: notification failures must not roll back the like insert.
      // likerName is denormalised at creation time — reflects the name at the time of the like.
      if (input.postId) {
        const post = await db.query.posts.findFirst({
          where: eq(posts.id, input.postId),
          columns: { authorId: true },
        });
        if (post && post.authorId !== ctx.user.id) {
          db.insert(notifications).values({
            id: createId(),
            userId: post.authorId,
            type: "post_like",
            data: { likerId: ctx.user.id, likerName: ctx.user.name, postId: input.postId },
          }).catch((err: unknown) => log.error("notification insert(postLike) failed", { err: String(err) }));
          void enqueuePush(post.authorId, {
            title: "New like",
            body: `${ctx.user.name ?? "Someone"} liked your post.`,
            url: `/feed/${input.postId}`,
          }).catch((err: unknown) => log.error("enqueuePush(postLike) failed", { err: String(err) }));
        }
      } else if (input.commentId) {
        const comment = await db.query.comments.findFirst({
          where: eq(comments.id, input.commentId),
          columns: { authorId: true, postId: true },
        });
        if (comment && comment.authorId !== ctx.user.id) {
          db.insert(notifications).values({
            id: createId(),
            userId: comment.authorId,
            type: "comment_like",
            data: { likerId: ctx.user.id, likerName: ctx.user.name, commentId: input.commentId, postId: comment.postId },
          }).catch((err: unknown) => log.error("notification insert(commentLike) failed", { err: String(err) }));
          void enqueuePush(comment.authorId, {
            title: "New like",
            body: `${ctx.user.name ?? "Someone"} liked your comment.`,
            url: `/feed/${comment.postId}`,
          }).catch((err: unknown) => log.error("enqueuePush(commentLike) failed", { err: String(err) }));
        }
      }

      return { liked: true };
    }),

  // Fetch a single post by id for the permalink page (/feed/[postId]).
  // Caller must be able to see the post: either it is on a group they belong to,
  // or the author is a friend (same visibility rules as the feed list).
  // Returns null when the post does not exist or the caller lacks access.
  getPost: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const post = await db.query.posts.findFirst({
        where: and(eq(posts.id, input.id), isNull(posts.deletedAt)),
        with: {
          author: { columns: { id: true, name: true, username: true, image: true } },
          group: { columns: { id: true, name: true } },
          event: { columns: { id: true, title: true } },
          reactions: { columns: { id: true, userId: true, type: true } },
          comments: {
            where: isNull(comments.deletedAt),
            orderBy: [asc(comments.createdAt)],
            with: {
              author: { columns: { id: true, name: true, username: true, image: true } },
              reactions: { columns: { id: true, userId: true, type: true } },
            },
          },
        },
      });
      if (!post) return null;

      // Visibility check: same rules as the feed list.
      // 1. Author's own post — always visible.
      if (post.author.id === ctx.user.id) return post;

      // 2. Group post — caller must be a member of that group.
      if (post.group) {
        const membership = await db.query.groupMemberships.findFirst({
          where: and(
            eq(groupMemberships.groupId, post.group.id),
            eq(groupMemberships.userId, ctx.user.id)
          ),
          columns: { groupId: true },
        });
        if (membership) return post;
        return null;
      }

      // 3. Non-group post — caller must be friends with the author.
      const friendship = await db.query.friendships.findFirst({
        where: and(
          or(
            and(eq(friendships.requesterId, ctx.user.id), eq(friendships.addresseeId, post.author.id)),
            and(eq(friendships.requesterId, post.author.id), eq(friendships.addresseeId, ctx.user.id))
          ),
          eq(friendships.status, "accepted")
        ),
        columns: { requesterId: true },
      });
      if (friendship) return post;
      return null;
    }),
});
