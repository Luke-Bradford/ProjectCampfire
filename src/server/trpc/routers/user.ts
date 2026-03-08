import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { user, type NotificationPrefs } from "@/server/db/schema";

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
});
