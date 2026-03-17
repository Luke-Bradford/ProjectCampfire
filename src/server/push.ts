import "server-only";
import webpush from "web-push";
import { env } from "@/env";
import { logger } from "@/lib/logger";

const log = logger.child("push");

// web-push is listed in next.config.ts serverExternalPackages so Next.js/Turbopack
// never bundles it — it is resolved from node_modules at runtime instead.

let _configured = false;

function configure(): void {
  if (_configured) return;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  _configured = true;
}

export function isPushEnabled(): boolean {
  return !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

export type PushSubscriptionData = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type PushPayload = {
  title: string;
  body: string;
  /** Relative URL to open when the notification is clicked */
  url?: string;
};

/**
 * Sends a push notification to a single subscription.
 * Returns true on success, false if the subscription has expired/invalid (caller should delete it).
 * Throws on unexpected errors (network, server, etc.).
 */
export async function sendPush(
  subscription: PushSubscriptionData,
  payload: PushPayload
): Promise<{ ok: boolean; expired: boolean }> {
  configure();
  if (!_configured) {
    log.warn("sendPush called but VAPID not configured — skipping");
    return { ok: false, expired: false };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify(payload),
      { TTL: 24 * 60 * 60 } // 24-hour TTL — discard if device offline for >24h
    );
    return { ok: true, expired: false };
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 410 || status === 404) {
      // 410 Gone / 404 Not Found — subscription is invalid, caller should remove it
      return { ok: false, expired: true };
    }
    throw err;
  }
}
