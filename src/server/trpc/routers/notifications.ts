import { z } from "zod";
import { and, count, desc, eq, isNull, notInArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createId } from "@paralleldrive/cuid2";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { notifications, notificationTypeEnum, pushSubscriptions } from "@/server/db/schema";
import { isPushEnabled } from "@/server/push";
import { env } from "@/env";

export const notificationsRouter = createTRPCRouter({
  // Unread count for the bell badge (CAMP-120)
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await db
      .select({ count: count() })
      .from(notifications)
      .where(
        and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt))
      );
    return { count: row?.count ?? 0 };
  }),

  // Full list, newest first (CAMP-120)
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(30) }))
    .query(async ({ ctx, input }) => {
      return db.query.notifications.findMany({
        where: eq(notifications.userId, ctx.user.id),
        orderBy: [desc(notifications.createdAt)],
        limit: input.limit,
      });
    }),

  // Mark a single notification read
  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id))
        );
    }),

  // Mark all read (CAMP-120)
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt))
      );
  }),

  // Mark all read except specific notification types — single DB call, no loop (CAMP-143)
  markAllReadExcept: protectedProcedure
    .input(z.object({ excludeTypes: z.array(z.enum(notificationTypeEnum.enumValues)).min(1) }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.userId, ctx.user.id),
            isNull(notifications.readAt),
            notInArray(notifications.type, input.excludeTypes)
          )
        );
    }),

  // ── Push notifications (CAMP-131) ─────────────────────────────────────────

  /**
   * Returns the VAPID public key for the client to use when calling
   * PushManager.subscribe(). Returns null if push is not configured.
   */
  vapidPublicKey: protectedProcedure.query(() => {
    return { key: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null };
  }),

  /**
   * Register (or re-register) a push subscription for the current user.
   * The (userId, endpoint) pair is unique — re-subscribing the same browser
   * overwrites the keys in case they rotated.
   */
  subscribePush: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url().max(2048),
        p256dh: z.string().min(1).max(256),
        auth: z.string().min(1).max(64),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isPushEnabled()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Push notifications are not configured on this server." });
      }

      // Upsert using onConflictDoUpdate — avoids the SELECT+INSERT race that
      // arises when two concurrent calls for the same (userId, endpoint) both
      // see no existing row and then both attempt INSERT.
      await db
        .insert(pushSubscriptions)
        .values({
          id: createId(),
          userId: ctx.user.id,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
        })
        .onConflictDoUpdate({
          target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
          set: { p256dh: input.p256dh, auth: input.auth },
        });
    }),

  /**
   * Remove a push subscription by endpoint. Used when the user clicks
   * "Disable push notifications" or when the browser unsubscribes.
   */
  unsubscribePush: protectedProcedure
    .input(z.object({ endpoint: z.string().url().max(2048) }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, ctx.user.id),
            eq(pushSubscriptions.endpoint, input.endpoint)
          )
        );
    }),

  /**
   * Returns true if the current user has at least one active push subscription.
   */
  hasPushSubscription: protectedProcedure.query(async ({ ctx }) => {
    const sub = await db.query.pushSubscriptions.findFirst({
      where: eq(pushSubscriptions.userId, ctx.user.id),
      columns: { id: true },
    });
    return { subscribed: !!sub };
  }),
});
