import { z } from "zod";
import { and, count, desc, eq, isNull, notInArray } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";
import { db } from "@/server/db";
import { notifications, notificationTypeEnum } from "@/server/db/schema";

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
});
