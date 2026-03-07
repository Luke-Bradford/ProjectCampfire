import { createTRPCRouter } from "@/server/trpc/trpc";
import { userRouter } from "./user";

export const appRouter = createTRPCRouter({
  user: userRouter,
});

export type AppRouter = typeof appRouter;
