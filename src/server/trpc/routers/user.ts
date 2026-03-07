import { createTRPCRouter, protectedProcedure } from "@/server/trpc/trpc";

export const userRouter = createTRPCRouter({
  me: protectedProcedure.query(({ ctx }) => {
    return ctx.user;
  }),
});
