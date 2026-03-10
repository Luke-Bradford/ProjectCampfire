import { Queue } from "bullmq";
import { bullmqConnection } from "@/server/redis";

// ── Job payload types ─────────────────────────────────────────────────────────

export type EmailJobType =
  | "event_confirmed"
  | "event_cancelled"
  | "event_rsvp_reminder"
  | "poll_opened"
  | "poll_closed"
  | "group_invite"
  | "friend_request"
  | "friend_request_accepted";

export type EventConfirmedPayload = {
  type: "event_confirmed";
  eventId: string;
  eventTitle: string;
  groupName: string;
  confirmedStartsAt: string; // ISO string
  confirmedEndsAt: string | null;
  recipientUserIds: string[]; // users who RSVPd yes/maybe
};

export type EventCancelledPayload = {
  type: "event_cancelled";
  eventId: string;
  eventTitle: string;
  groupName: string;
  recipientUserIds: string[];
};

export type EventRsvpReminderPayload = {
  type: "event_rsvp_reminder";
  eventId: string;
  eventTitle: string;
  groupName: string;
  recipientUserIds: string[]; // members who haven't RSVPd
};

export type PollOpenedPayload = {
  type: "poll_opened";
  pollId: string;
  pollQuestion: string;
  groupName: string;
  eventTitle?: string;
  /** Deep link to the event or group page where the poll lives. */
  ctaUrl: string;
  recipientUserIds: string[];
};

export type PollClosedPayload = {
  type: "poll_closed";
  pollId: string;
  pollQuestion: string;
  groupName: string;
  /** Deep link to the event or group page where the poll lives. */
  ctaUrl: string;
  recipientUserIds: string[]; // users who voted
};

export type GroupInvitePayload = {
  type: "group_invite";
  groupId: string;
  groupName: string;
  inviterName: string;
  recipientUserId: string;
};

export type FriendRequestPayload = {
  type: "friend_request";
  requesterName: string;
  recipientUserId: string;
};

export type FriendRequestAcceptedPayload = {
  type: "friend_request_accepted";
  acceptorName: string;
  recipientUserId: string;
};

export type EmailJobPayload =
  | EventConfirmedPayload
  | EventCancelledPayload
  | EventRsvpReminderPayload
  | PollOpenedPayload
  | PollClosedPayload
  | GroupInvitePayload
  | FriendRequestPayload
  | FriendRequestAcceptedPayload;

// ── Queue (shared singleton) ──────────────────────────────────────────────────

export const emailQueue = new Queue<EmailJobPayload>("email", {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// ── Enqueue helpers ───────────────────────────────────────────────────────────

export function enqueueEventConfirmed(payload: Omit<EventConfirmedPayload, "type">) {
  return emailQueue.add("event_confirmed", { type: "event_confirmed", ...payload });
}

export function enqueueEventCancelled(payload: Omit<EventCancelledPayload, "type">) {
  return emailQueue.add("event_cancelled", { type: "event_cancelled", ...payload });
}

export function enqueueEventRsvpReminder(payload: Omit<EventRsvpReminderPayload, "type">, delay?: number) {
  return emailQueue.add(
    "event_rsvp_reminder",
    { type: "event_rsvp_reminder", ...payload },
    delay ? { delay } : undefined
  );
}

export function enqueuePollOpened(payload: Omit<PollOpenedPayload, "type">) {
  return emailQueue.add("poll_opened", { type: "poll_opened", ...payload });
}

export function enqueuePollClosed(payload: Omit<PollClosedPayload, "type">) {
  return emailQueue.add("poll_closed", { type: "poll_closed", ...payload });
}

export function enqueueFriendRequest(payload: Omit<FriendRequestPayload, "type">) {
  return emailQueue.add("friend_request", { type: "friend_request", ...payload });
}

export function enqueueFriendRequestAccepted(payload: Omit<FriendRequestAcceptedPayload, "type">) {
  return emailQueue.add("friend_request_accepted", { type: "friend_request_accepted", ...payload });
}
