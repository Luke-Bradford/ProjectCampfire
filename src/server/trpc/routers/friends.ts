import { z } from "zod";
import { and, eq, ilike, ne, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { user, friendships, notifications } from "@/server/db/schema";
import { enqueueFriendRequest, enqueueFriendRequestAccepted } from "@/server/jobs/email-jobs";

export const friendsRouter = createTRPCRouter({
  // Search open-profile users by username or display name (CAMP-020)
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(50) }))
    .query(async ({ ctx, input }) => {
      const term = `%${input.query}%`;
      return db
        .select({
          id: user.id,
          name: user.name,
          username: user.username,
          image: user.image,
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
        .catch((err) => console.error("enqueueFriendRequest failed", err));
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
          .catch((err) => console.error("enqueueFriendRequestAccepted failed", err));
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
        requester: { columns: { id: true, name: true, username: true, image: true } },
        addressee: { columns: { id: true, name: true, username: true, image: true } },
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
        .catch((err) => console.error("enqueueFriendRequest failed", err));
    }),
});
