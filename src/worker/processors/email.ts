import type { Job } from "bullmq";
import { inArray, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import type { NotificationPrefs } from "@/server/db/schema";
import { sendEmail } from "@/server/email";
import type { EmailJobPayload } from "@/server/jobs/email-jobs";
import { env } from "@/env";

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
};

function pref(prefs: Prefs | null | undefined, key: keyof Required<Prefs>): boolean {
  if (prefs && key in prefs) return prefs[key] as boolean;
  return DEFAULTS[key];
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
        await sendEmail({
          to: r.email,
          subject: safeSubject(`RSVP reminder: ${data.eventTitle}`),
          text: `Hi ${strip(r.name)},\n\nHave you had a chance to RSVP to "${strip(data.eventTitle)}" in ${strip(data.groupName)}?\n\nView event: ${appUrl()}/events/${data.eventId}`,
          html: htmlEmail(
            `RSVP reminder: ${esc(data.eventTitle)}`,
            `<p>Hi ${esc(r.name)},</p><p>Have you had a chance to RSVP to <strong>${esc(data.eventTitle)}</strong> in <strong>${esc(data.groupName)}</strong>?</p>`,
            `${appUrl()}/events/${data.eventId}`,
            "RSVP now"
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

    default: {
      const _exhaustive: never = data;
      console.warn("Unknown email job type:", (_exhaustive as { type: string }).type);
    }
  }
}
