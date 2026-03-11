import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user, session, account, verification } from "@/server/db/schema";
import { env } from "@/env";

/**
 * Returns false to cancel session creation if the user is soft-deleted,
 * or undefined to proceed normally.
 *
 * Exported for unit testing — the logic lives here so tests exercise
 * the production code path, not a copy.
 *
 * Hook contract (verified against better-auth@1.5.4 dist/db/with-hooks.mjs):
 *   return false       → cancel session creation (returns null from createWithHooks)
 *   return { data: x } → use modified session data
 *   return undefined   → proceed with original session data (our happy path)
 * On any better-auth version bump, re-verify this contract before upgrading.
 */
export async function checkSessionAllowed(userId: string): Promise<false | undefined> {
  const row = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { deletedAt: true },
  });
  if (row?.deletedAt) {
    return false; // cancels session creation
  }
  // undefined return → proceed normally
}

const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {};

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  };
}

if (env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET) {
  socialProviders.discord = {
    clientId: env.DISCORD_CLIENT_ID,
    clientSecret: env.DISCORD_CLIENT_SECRET,
  };
}

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
  socialProviders,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
  databaseHooks: {
    session: {
      create: {
        before: (newSession) => checkSessionAllowed(newSession.userId),
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"];
