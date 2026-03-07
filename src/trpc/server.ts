import "server-only";
import { createCallerFactory, createTRPCContext } from "@/server/trpc/trpc";
import { appRouter } from "@/server/trpc/routers/_app";
import { headers } from "next/headers";

const createCaller = createCallerFactory(appRouter);

export const trpc = createCaller(async () => {
  return createTRPCContext({
    headers: await headers(),
  });
});
