import type { Job } from "bullmq";
import { inArray, eq, and, or, gte, isNull, not, desc } from "drizzle-orm";
import { db } from "@/server/db";
import { user, posts, friendships, groupMemberships } from "@/server/db/schema";
import type { NotificationPrefs } from "@/server/db/schema";
import { sendEmail } from "@/server/email";
import type { EmailJobPayload } from "@/server/jobs/email-jobs";
import { emailQueue } from "@/server/jobs/email-jobs";
import { createRsvpToken } from "@/server/rsvp-token";
import { env } from "@/env";
import { logger } from "@/lib/logger";

const log = logger.child("email");

type Prefs = NotificationPrefs;

const appUrl = () => env.NEXT_PUBLIC_APP_URL;

// ── Preference defaults (mirrors settings page) ───────────────────────────────

const DEFAULTS: Required<Prefs> = {
  friendRequestReceived: true,
  friendRequestAccepted: true,
  groupInviteReceived: true,
  emailFriendRequest: false,
  emailEventConfirmed: true,
  emailEventCancelled: true,
  emailEventRsvpReminder: true,
  emailPollOpened: true,
  emailPollClosed: false,
  emailGroupInvite: true,
  emailFeedDigest: "off",
};

function pref(prefs: Prefs | null | undefined, key: Exclude<keyof Required<Prefs>, "emailFeedDigest">): boolean {
  if (prefs && key in prefs) return prefs[key] as boolean;
  return DEFAULTS[key] as boolean;
}

// ── HTML escaping ─────────────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Strip CR/LF — used on subject (header injection) and text bodies (garbled output)
function strip(str: string): string {
  return str.replace(/[\r\n]+/g, " ");
}

function safeSubject(str: string): string {
  return strip(str);
}

// ── Simple HTML email template ────────────────────────────────────────────────

function htmlEmail(title: string, bodyHtml: string, ctaUrl?: string, ctaLabel?: string) {
  const cta = ctaUrl
    ? `<p style="margin-top:24px"><a href="${ctaUrl}" style="background:#e05f1a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">${ctaLabel ?? "View"}</a></p>`
    : "";
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
<h2 style="margin-top:0">${title}</h2>
${bodyHtml}
${cta}
<hr style="margin-top:40px;border:none;border-top:1px solid #e5e5e5"/>
<p style="font-size:12px;color:#888">You're receiving this because you have email notifications enabled for Campfire. <a href="${appUrl()}/settings">Manage preferences</a></p>
</body></html>`;
}

// ── Fetch recipients with prefs ───────────────────────────────────────────────

async function getRecipients(userIds: string[]) {
  if (userIds.length === 0) return [];
  return db.query.user.findMany({
    where: inArray(user.id, userIds),
    columns: { id: true, name: true, email: true, notificationPrefs: true },
  });
}

async function getSingleRecipient(userId: string) {
  return db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { id: true, name: true, email: true, notificationPrefs: true },
  });
}

// ── Processor ─────────────────────────────────────────────────────────────────

export async function processEmailJob(job: Job<EmailJobPayload>) {
  const data = job.data;

  switch (data.type) {
    case "event_confirmed": {
      const recipients = await getRecipients(data.recipientUserIds);
      const dateStr = new Date(data.confirmedStartsAt).toLocaleString("en-GB", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
      const endsStr = data.confirmedEndsAt
        ? ` – ${new Date(data.confirmedEndsAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
        : "";
      for (const r of recipients) {
        if (!pref(r.notificationPrefs as Prefs, "emailEventConfirmed")) continue;
        await sendEmail({
          to: r.email,
          subject: safeSubject(`Event confirmed: ${data.eventTitle}`),
          text: `Hi ${strip(r.name)},\n\n"${strip(data.eventTitle)}" in ${strip(data.groupName)} has been confirmed for ${dateStr}${endsStr}.\n\nView event: ${appUrl()}/events/${data.eventId}`,
          html: htmlEmail(
            `Event confirmed: ${esc(data.eventTitle)}`,
            `<p>Hi ${esc(r.name)},</p><p><strong>${esc(data.eventTitle)}</strong> in <strong>${esc(data.groupName)}</strong> has been confirmed for <strong>${esc(dateStr)}${esc(endsStr)}</strong>.</p>`,
            `${appUrl()}/events/${data.eventId}`,
            "View event"
          ),
        });
      }
      break;
    }

    case "event_cancelled": {
      const recipients = await getRecipients(data.recipientUserIds);
      for (const r of recipients) {
        if (!pref(r.notificationPrefs as Prefs, "emailEventCancelled")) continue;
        await sendEmail({
          to: r.email,
          subject: safeSubject(`Event cancelled: ${data.eventTitle}`),
          text: `Hi ${strip(r.name)},\n\nUnfortunately "${strip(data.eventTitle)}" in ${strip(data.groupName)} has been cancelled.\n\nView group: ${appUrl()}/groups`,
          html: htmlEmail(
            `Event cancelled: ${esc(data.eventTitle)}`,
            `<p>Hi ${esc(r.name)},</p><p>Unfortunately <strong>${esc(data.eventTitle)}</strong> in <strong>${esc(data.groupName)}</strong> has been cancelled.</p>`,
            `${appUrl()}/events/${data.eventId}`,
            "View event"
          ),
        });
      }
      break;
    }

    case "event_rsvp_reminder": {
      const recipients = await getRecipients(data.recipientUserIds);
      for (const r of recipients) {
        if (!pref(r.notificationPrefs as Prefs, "emailEventRsvpReminder")) continue;
        const yesToken = createRsvpToken({ eventId: data.eventId, userId: r.id, status: "yes" });
        const noToken = createRsvpToken({ eventId: data.eventId, userId: r.id, status: "no" });
        const maybeToken = createRsvpToken({ eventId: data.eventId, userId: r.id, status: "maybe" });
        const rsvpBase = `${appUrl()}/rsvp?token=`;
        await sendEmail({
          to: r.email,
          subject: safeSubject(`RSVP reminder: ${data.eventTitle}`),
          text: `Hi ${strip(r.name)},\n\nHave you had a chance to RSVP to "${strip(data.eventTitle)}" in ${strip(data.groupName)}?\n\nGoing: ${rsvpBase}${yesToken}\nNot going: ${rsvpBase}${noToken}\nMaybe: ${rsvpBase}${maybeToken}\n\nView event: ${appUrl()}/events/${data.eventId}`,
          html: htmlEmail(
            `RSVP reminder: ${esc(data.eventTitle)}`,
            `<p>Hi ${esc(r.name)},</p><p>Have you had a chance to RSVP to <strong>${esc(data.eventTitle)}</strong> in <strong>${esc(data.groupName)}</strong>?</p><p style="margin-top:16px">Click a button to RSVP without logging in:</p><p style="margin-top:12px"><a href="${rsvpBase}${yesToken}" style="background:#16a34a;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:600;margin-right:8px">Going</a><a href="${rsvpBase}${maybeToken}" style="background:#ca8a04;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:600;margin-right:8px">Maybe</a><a href="${rsvpBase}${noToken}" style="background:#dc2626;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:600">Not going</a></p>`,
            `${appUrl()}/events/${data.eventId}`,
            "View event"
          ),
        });
      }
      break;
    }

    case "poll_opened": {
      const recipients = await getRecipients(data.recipientUserIds);
      const context = data.eventTitle ? ` for "${data.eventTitle}"` : "";
      const contextHtml = data.eventTitle ? ` for &ldquo;${esc(data.eventTitle)}&rdquo;` : "";
      for (const r of recipients) {
        if (!pref(r.notificationPrefs as Prefs, "emailPollOpened")) continue;
        await sendEmail({
          to: r.email,
          subject: safeSubject(`New poll${context}: ${data.pollQuestion}`),
          text: `Hi ${strip(r.name)},\n\nA new poll has been opened in ${strip(data.groupName)}${context}:\n\n"${strip(data.pollQuestion)}"\n\nCast your vote: ${data.ctaUrl}`,
          html: htmlEmail(
            `New poll in ${esc(data.groupName)}`,
            `<p>Hi ${esc(r.name)},</p><p>A new poll has been opened${contextHtml}:</p><blockquote style="border-left:3px solid #e05f1a;margin:16px 0;padding:8px 16px;color:#444">${esc(data.pollQuestion)}</blockquote>`,
            data.ctaUrl,
            "Vote now"
          ),
        });
      }
      break;
    }

    case "poll_closed": {
      const recipients = await getRecipients(data.recipientUserIds);
      for (const r of recipients) {
        if (!pref(r.notificationPrefs as Prefs, "emailPollClosed")) continue;
        await sendEmail({
          to: r.email,
          subject: safeSubject(`Poll closed: ${data.pollQuestion}`),
          text: `Hi ${strip(r.name)},\n\nThe poll "${strip(data.pollQuestion)}" in ${strip(data.groupName)} has been closed. Check the results!\n\nView results: ${data.ctaUrl}`,
          html: htmlEmail(
            `Poll closed: results are in`,
            `<p>Hi ${esc(r.name)},</p><p>The poll <strong>&ldquo;${esc(data.pollQuestion)}&rdquo;</strong> in <strong>${esc(data.groupName)}</strong> has been closed.</p>`,
            data.ctaUrl,
            "View results"
          ),
        });
      }
      break;
    }

    case "group_invite": {
      const r = await getSingleRecipient(data.recipientUserId);
      if (!r) break;
      if (!pref(r.notificationPrefs as Prefs, "emailGroupInvite")) break;
      await sendEmail({
        to: r.email,
        subject: safeSubject(`You've been invited to ${data.groupName}`),
        text: `Hi ${strip(r.name)},\n\n${strip(data.inviterName)} has invited you to join "${strip(data.groupName)}" on Campfire.\n\nJoin: ${appUrl()}/groups/${data.groupId}`,
        html: htmlEmail(
          `You've been invited to ${esc(data.groupName)}`,
          `<p>Hi ${esc(r.name)},</p><p><strong>${esc(data.inviterName)}</strong> has invited you to join <strong>${esc(data.groupName)}</strong> on Campfire.</p>`,
          `${appUrl()}/groups/${data.groupId}`,
          "View group"
        ),
      });
      break;
    }

    case "friend_request": {
      const r = await getSingleRecipient(data.recipientUserId);
      if (!r) break;
      if (!pref(r.notificationPrefs as Prefs, "emailFriendRequest")) break;
      await sendEmail({
        to: r.email,
        subject: safeSubject(`${data.requesterName} sent you a friend request`),
        text: `Hi ${strip(r.name)},\n\n${strip(data.requesterName)} sent you a friend request on Campfire.\n\nRespond: ${appUrl()}/friends`,
        html: htmlEmail(
          `New friend request`,
          `<p>Hi ${esc(r.name)},</p><p><strong>${esc(data.requesterName)}</strong> sent you a friend request on Campfire.</p>`,
          `${appUrl()}/friends`,
          "Respond"
        ),
      });
      break;
    }

    case "friend_request_accepted": {
      const r = await getSingleRecipient(data.recipientUserId);
      if (!r) break;
      if (!pref(r.notificationPrefs as Prefs, "emailFriendRequest")) break;
      await sendEmail({
        to: r.email,
        subject: safeSubject(`${data.acceptorName} accepted your friend request`),
        text: `Hi ${strip(r.name)},\n\n${strip(data.acceptorName)} accepted your friend request on Campfire.\n\nView friends: ${appUrl()}/friends`,
        html: htmlEmail(
          `Friend request accepted`,
          `<p>Hi ${esc(r.name)},</p><p><strong>${esc(data.acceptorName)}</strong> accepted your friend request on Campfire.</p>`,
          `${appUrl()}/friends`,
          "View friends"
        ),
      });
      break;
    }

    case "sweep_feed_digests": {
      await sweepFeedDigests(data.frequency);
      break;
    }

    case "send_feed_digest": {
      await sendFeedDigest(data.userId, data.frequency);
      break;
    }

    default: {
      const _exhaustive: never = data;
      log.warn("unknown job type", { type: (_exhaustive as { type: string }).type });
    }
  }
}

// ── Feed digest helpers ───────────────────────────────────────────────────────

/**
 * Scans all users who have emailFeedDigest === frequency and enqueues
 * individual send_feed_digest jobs for each.
 * Runs as a daily (for "daily" freq) or weekly (for "weekly" freq) sweep.
 */
async function sweepFeedDigests(frequency: "daily" | "weekly"): Promise<void> {
  // Fetch users with the matching digest preference.
  // emailFeedDigest is stored in notificationPrefs jsonb.
  // We cast to text and filter in JS — user table is bounded by registered users.
  const users = await db
    .select({ id: user.id, notificationPrefs: user.notificationPrefs })
    .from(user)
    .where(isNull(user.deletedAt));

  const targets = users.filter((u) => {
    const prefs = u.notificationPrefs as NotificationPrefs | null | undefined;
    return (prefs?.emailFeedDigest ?? "off") === frequency;
  });

  if (targets.length === 0) {
    log.info("sweep_feed_digests: no subscribers", { frequency });
    return;
  }

  await emailQueue.addBulk(
    targets.map((u) => ({
      name: "send_feed_digest",
      data: { type: "send_feed_digest" as const, userId: u.id, frequency },
    }))
  );

  log.info("sweep_feed_digests: enqueued", { frequency, count: targets.length });
}

type DigestPost = {
  id: string;
  body: string | null;
  authorName: string;
  createdAt: Date;
  commentCount: number;
};

/**
 * Builds and sends a feed digest email to one user.
 * Skips silently if the user has since opted out or if there are no new posts.
 */
async function sendFeedDigest(userId: string, frequency: "daily" | "weekly"): Promise<void> {
  const recipient = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { id: true, name: true, email: true, notificationPrefs: true, deletedAt: true },
  });

  if (!recipient || recipient.deletedAt) return;

  const prefs = recipient.notificationPrefs as NotificationPrefs | null | undefined;
  if ((prefs?.emailFeedDigest ?? "off") !== frequency) return; // opted out since job was enqueued

  const lookbackMs = frequency === "daily" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - lookbackMs);

  // Friends + group memberships
  const [friendRows, memberRows] = await Promise.all([
    db
      .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId })
      .from(friendships)
      .where(
        and(
          or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
          eq(friendships.status, "accepted")
        )
      ),
    db
      .select({ groupId: groupMemberships.groupId })
      .from(groupMemberships)
      .where(eq(groupMemberships.userId, userId)),
  ]);

  const friendIds = friendRows.map((r) =>
    r.requesterId === userId ? r.addresseeId : r.requesterId
  );
  const myGroupIds = memberRows.map((r) => r.groupId);

  if (friendIds.length === 0 && myGroupIds.length === 0) return; // no social graph yet

  // Fetch recent posts visible to this user (same visibility rules as the feed).
  // Cap at 20 posts per digest to keep emails readable.
  const visibilityFilter = or(
    friendIds.length > 0 ? and(inArray(posts.authorId, friendIds), isNull(posts.groupId)) : undefined,
    myGroupIds.length > 0 ? inArray(posts.groupId, myGroupIds) : undefined
  );

  if (!visibilityFilter) return;

  const recentPosts = await db
    .select({
      id: posts.id,
      body: posts.body,
      authorId: posts.authorId,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(
      and(
        visibilityFilter,
        gte(posts.createdAt, since),
        isNull(posts.deletedAt),
        not(eq(posts.authorId, userId)), // exclude own posts
      )
    )
    .orderBy(desc(posts.createdAt))
    .limit(20);

  if (recentPosts.length === 0) return; // nothing new, skip

  // Fetch author names for the post batch
  const authorIds = [...new Set(recentPosts.map((p) => p.authorId))];
  const authors = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, authorIds));
  const authorMap = new Map(authors.map((a) => [a.id, a.name]));

  const digestPosts: DigestPost[] = recentPosts.map((p) => ({
    id: p.id,
    body: p.body,
    authorName: authorMap.get(p.authorId) ?? "Someone",
    createdAt: p.createdAt,
    commentCount: 0, // not fetching counts for simplicity — kept minimal per MVP
  }));

  const periodLabel = frequency === "daily" ? "today" : "this week";
  const subject = `Your Campfire digest — ${digestPosts.length} new post${digestPosts.length === 1 ? "" : "s"} ${periodLabel}`;

  const postItemsText = digestPosts
    .map((p) => `• ${strip(p.authorName)}: ${strip(p.body ?? "(image or link)")}`)
    .join("\n");

  const postItemsHtml = digestPosts
    .map(
      (p) =>
        `<li style="margin-bottom:12px"><strong>${esc(p.authorName)}</strong><br/><span style="color:#444">${esc(p.body ?? "(image or link)")}</span></li>`
    )
    .join("\n");

  await sendEmail({
    to: recipient.email,
    subject: safeSubject(subject),
    text: `Hi ${strip(recipient.name)},\n\nHere's what happened on Campfire ${periodLabel}:\n\n${postItemsText}\n\nView your feed: ${appUrl()}/feed`,
    html: htmlEmail(
      `Your Campfire digest`,
      `<p>Hi ${esc(recipient.name)},</p><p>Here's what happened ${periodLabel}:</p><ul style="padding-left:0;list-style:none;margin:16px 0">${postItemsHtml}</ul>`,
      `${appUrl()}/feed`,
      "Open feed"
    ),
  });

  log.info("feed digest sent", { userId, frequency, postCount: digestPosts.length });
}
