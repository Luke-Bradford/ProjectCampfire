import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
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
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"];
