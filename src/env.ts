import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32),
    MINIO_ENDPOINT: z.string(),
    MINIO_PORT: z.coerce.number().default(9000),
    MINIO_ACCESS_KEY: z.string(),
    MINIO_SECRET_KEY: z.string(),
    MINIO_BUCKET: z.string().default("campfire"),
    // Public base URL for browser-facing object URLs (e.g. http://localhost:9000/campfire).
    // Required when MINIO_ENDPOINT is a Docker-internal hostname not reachable by browsers.
    MINIO_PUBLIC_URL: z.string().url().optional(),
    // Whether the MinIO client should connect over TLS. Defaults to false.
    // Set to true only when MinIO itself is TLS-enabled (not when TLS is terminated by a proxy).
    // z.coerce.boolean() is intentionally avoided: Boolean("false") === true.
    MINIO_USE_SSL: z.string().default("false").transform((v) => v === "true" || v === "1"),
    SMTP_HOST: z.string(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().email(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    // IGDB (via Twitch OAuth) — optional. When set, IGDB search/import is enabled.
    IGDB_CLIENT_ID: z.string().optional(),
    IGDB_CLIENT_SECRET: z.string().optional(),
    // Social OAuth — optional. When set, the respective provider button appears on login/register.
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    DISCORD_CLIENT_ID: z.string().optional(),
    DISCORD_CLIENT_SECRET: z.string().optional(),
    // Steam Web API key — required for library sync (IPlayerService/GetOwnedGames)
    STEAM_API_KEY: z.string().optional(),
    // Minimum log level. One of: error | warn | info | debug. Defaults to "info".
    LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
    // Giphy API key — optional. When set, the GIF picker is enabled in the composer.
    // Get a free key at https://developers.giphy.com/dashboard/
    GIPHY_API_KEY: z.string().optional(),
    // Web Push (VAPID) — optional. When set, browser push notifications are enabled.
    // Generate keys with: npx web-push generate-vapid-keys
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    // Typically "mailto:<email>" or the app URL. Required when VAPID keys are set.
    VAPID_SUBJECT: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    // Must match VAPID_PUBLIC_KEY — exposed to the client for push subscription registration.
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
    // Set to "true" when the corresponding server-side OAuth credentials are configured.
    // Controls whether the social login buttons are rendered on the client.
    NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED: z.literal("true").optional(),
    NEXT_PUBLIC_DISCORD_OAUTH_ENABLED: z.literal("true").optional(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    MINIO_ENDPOINT: process.env.MINIO_ENDPOINT,
    MINIO_PORT: process.env.MINIO_PORT,
    MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY,
    MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY,
    MINIO_BUCKET: process.env.MINIO_BUCKET,
    MINIO_PUBLIC_URL: process.env.MINIO_PUBLIC_URL,
    MINIO_USE_SSL: process.env.MINIO_USE_SSL,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    EMAIL_FROM: process.env.EMAIL_FROM,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED: process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED,
    NEXT_PUBLIC_DISCORD_OAUTH_ENABLED: process.env.NEXT_PUBLIC_DISCORD_OAUTH_ENABLED,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    IGDB_CLIENT_ID: process.env.IGDB_CLIENT_ID,
    IGDB_CLIENT_SECRET: process.env.IGDB_CLIENT_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
    STEAM_API_KEY: process.env.STEAM_API_KEY,
    GIPHY_API_KEY: process.env.GIPHY_API_KEY,
    LOG_LEVEL: process.env.LOG_LEVEL,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
