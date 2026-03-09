import { initTRPC, TRPCError } from "@trpc/server";
import { cache } from "react";
import superjson from "superjson";
import { ZodError } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { auth } from "@/server/auth";

export const createTRPCContext = cache(async (opts: { headers: Headers }) => {
  const result = await auth.api.getSession({ headers: opts.headers });
  return {
    db,
    user: result?.user ?? null,
    session: result?.session ?? null,
    ...opts,
  };
});

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user || !ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  // Reject requests from soft-deleted accounts. better-auth's session hook only
  // blocks *new* session creation; existing sessions remain valid until they
  // expire or are deleted. This check ensures a deleted user's in-flight session
  // cannot call any protected endpoint.
  const row = await db.query.user.findFirst({
    where: eq(user.id, ctx.user.id),
    columns: { deletedAt: true },
  });
  if (row?.deletedAt) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      user: ctx.user,
      session: ctx.session,
    },
  });
});
