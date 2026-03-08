import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user, session, account, verification } from "@/server/db/schema";
import { env } from "@/env";

export const auth = betterAuth({
  secret: env.AUTH_SECRET,
  baseURL: env.NEXT_PUBLIC_APP_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    // Set requireEmailVerification: true when SMTP is configured
    requireEmailVerification: false,
  },
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
  databaseHooks: {
    session: {
      create: {
        // Block session creation for soft-deleted accounts. This covers both
        // email/password sign-in and OAuth re-authentication, preventing a
        // deleted user from logging back in or having a new session provisioned.
        before: async (newSession) => {
          const row = await db.query.user.findFirst({
            where: eq(user.id, newSession.userId),
            columns: { deletedAt: true },
          });
          if (row?.deletedAt) {
            // Returning false cancels session creation (better-auth convention)
            return false;
          }
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"];
