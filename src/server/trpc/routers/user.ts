import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { user, session, account, type NotificationPrefs } from "@/server/db/schema";
import { enqueueScrubAccount } from "@/server/jobs/account-jobs";

const notificationPrefsSchema = z.object({
  friendRequestReceived: z.boolean().optional(),
  friendRequestAccepted: z.boolean().optional(),
  groupInviteReceived: z.boolean().optional(),
  emailFriendRequest: z.boolean().optional(),
  emailEventConfirmed: z.boolean().optional(),
  emailEventCancelled: z.boolean().optional(),
  emailEventRsvpReminder: z.boolean().optional(),
  emailPollOpened: z.boolean().optional(),
  emailPollClosed: z.boolean().optional(),
  emailGroupInvite: z.boolean().optional(),
}) satisfies z.ZodType<NotificationPrefs>;

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export const userRouter = createTRPCRouter({
  me: protectedProcedure.query(async ({ ctx }) => {
    return db.query.user.findFirst({
      where: eq(user.id, ctx.user.id),
      columns: {
        id: true,
        name: true,
        email: true,
        image: true,
        username: true,
        bio: true,
        profileVisibility: true,
        notificationPrefs: true,
        inviteToken: true,
        createdAt: true,
      },
    });
  }),

  // Returns the user's invite token, generating one if it doesn't exist yet.
  getInviteToken: protectedProcedure.query(async ({ ctx }) => {
    const row = await db.query.user.findFirst({
      where: eq(user.id, ctx.user.id),
      columns: { inviteToken: true },
    });
    if (row?.inviteToken) return { token: row.inviteToken };
    const token = createId();
    await db.update(user).set({ inviteToken: token }).where(eq(user.id, ctx.user.id));
    return { token };
  }),

  // Generates a new invite token, invalidating the old one.
  regenerateInviteToken: protectedProcedure.mutation(async ({ ctx }) => {
    const token = createId();
    await db.update(user).set({ inviteToken: token }).where(eq(user.id, ctx.user.id));
    return { token };
  }),

  updateNotificationPrefs: protectedProcedure
    .input(notificationPrefsSchema)
    .mutation(async ({ ctx, input }) => {
      const current = await db.query.user.findFirst({
        where: eq(user.id, ctx.user.id),
        columns: { notificationPrefs: true },
      });
      const merged: NotificationPrefs = { ...(current?.notificationPrefs ?? {}), ...input };
      await db.update(user).set({ notificationPrefs: merged }).where(eq(user.id, ctx.user.id));
      return { ok: true };
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(50),
      bio: z.string().max(300).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(user)
        .set({ name: input.name, bio: input.bio ?? null })
        .where(eq(user.id, ctx.user.id));
    }),

  setUsername: protectedProcedure
    .input(z.object({ username: z.string().regex(USERNAME_RE, "3–20 chars, lowercase letters, numbers and underscores only") }))
    .mutation(async ({ ctx, input }) => {
      const current = await db.query.user.findFirst({
        where: eq(user.id, ctx.user.id),
        columns: { id: true, username: true, usernameChangedAt: true },
      });

      // Enforce 30-day cooldown on changes (not on first-time set)
      if (current?.username && current.username !== input.username && current.usernameChangedAt) {
        const daysSinceChange = (Date.now() - current.usernameChangedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceChange < 30) {
          const daysLeft = Math.ceil(30 - daysSinceChange);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `You can change your username again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
          });
        }
      }

      // Check uniqueness
      const existing = await db.query.user.findFirst({
        where: eq(user.username, input.username),
        columns: { id: true },
      });
      if (existing && existing.id !== ctx.user.id) {
        throw new TRPCError({ code: "CONFLICT", message: "That username is already taken." });
      }

      await db
        .update(user)
        .set({ username: input.username, usernameChangedAt: new Date() })
        .where(eq(user.id, ctx.user.id));
    }),

  // Soft-delete the current user's account.
  // Sets deletedAt, kills all sessions, and enqueues an async PII scrub job.
  deleteAccount: protectedProcedure
    .input(z.object({
      // The user must type "DELETE" — validated both client-side (disables button)
      // and server-side (Zod literal) so API callers can't bypass the confirmation.
      confirmation: z.literal("DELETE"),
    }))
    .mutation(async ({ ctx }) => {
      const userId = ctx.user.id;

      // All DB operations run in a single transaction so we never end up in a
      // partially-deleted state (e.g. sessions revoked but deletedAt not set).
      await db.transaction(async (tx) => {
        // Guard: only proceed if account isn't already soft-deleted.
        // Email is replaced here atomically so the real address is freed
        // immediately — the async scrub job handles the remaining PII fields.
        const updated = await tx
          .update(user)
          .set({ deletedAt: sql`now()`, email: `deleted-${userId}@invalid` })
          .where(and(eq(user.id, userId), isNull(user.deletedAt)))
          .returning({ id: user.id });

        if (updated.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Account already deleted." });
        }

        // Revoke all sessions immediately — this device and all others.
        // Any in-flight request using the current token will complete (the
        // session row is read at request start, before this transaction commits).
        // The client is redirected to /login on success so the deleted session
        // token is never reused. New session creation is blocked by the
        // better-auth databaseHook in src/server/auth/index.ts.
        await tx.delete(session).where(eq(session.userId, userId));

        // Revoke OAuth credentials so they can't be used to re-authenticate
        await tx.delete(account).where(eq(account.userId, userId));
      });

      // Fire-and-forget: the account is already soft-deleted and sessions revoked
      // regardless of whether Redis accepts the job. If the enqueue fails the
      // PII can be scrubbed by re-enqueueing manually; don't surface a 500 to
      // the client for what is already a completed deletion.
      enqueueScrubAccount(userId).catch((err: unknown) =>
        console.error("[deleteAccount] failed to enqueue scrub job for", userId, err),
      );

      return { success: true };
    }),
});
