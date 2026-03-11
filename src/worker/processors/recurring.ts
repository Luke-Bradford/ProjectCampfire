import type { Job } from "bullmq";
import { and, eq, gte } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/server/db";
import {
  recurringTemplates,
  events,
  polls,
  pollOptions,
  groupMemberships,
} from "@/server/db/schema";
import type { RecurringJobPayload } from "@/server/jobs/recurring-jobs";

export async function processRecurringJob(job: Job<RecurringJobPayload>): Promise<void> {
  const { data } = job;

  switch (data.type) {
    case "generate_recurring_events": {
      await generateRecurringEvents();
      break;
    }

    default: {
      console.warn("[recurring] unknown job type:", (data as { type: string }).type);
    }
  }
}

/**
 * For each active recurring template, compute the next occurrence date.
 * If that date falls within `leadDays` from today AND no event already exists
 * that was generated from this template for that target date, create one.
 *
 * Idempotent: the WHERE clause checks for existing events, so re-running on
 * the same day is safe.
 */
async function generateRecurringEvents(): Promise<void> {
  const templates = await db.query.recurringTemplates.findMany({
    where: eq(recurringTemplates.active, true),
  });

  if (templates.length === 0) {
    console.log("[recurring] generate_recurring_events: no active templates");
    return;
  }

  const results = await Promise.allSettled(
    templates.map((t) => maybeGenerateEvent(t))
  );

  const generated = results.filter(
    (r) => r.status === "fulfilled" && r.value === true
  ).length;
  const failed = results.filter((r) => r.status === "rejected").length;

  console.log(
    `[recurring] generate_recurring_events: checked ${templates.length} template(s), generated ${generated}, failed ${failed}`
  );
}

type RecurringTemplate = typeof recurringTemplates.$inferSelect;

/**
 * Compute the next occurrence of the template's day-of-week from today (in the
 * template's timezone), then generate an event if:
 *  1. The occurrence is within `leadDays` from today.
 *  2. No event already links to this template with a confirmedStartsAt on that date.
 *
 * Returns true if an event was generated, false if skipped.
 */
async function maybeGenerateEvent(template: RecurringTemplate): Promise<boolean> {
  // Compute "today" in the template's timezone using Intl
  const nowInTz = new Date(
    new Date().toLocaleString("en-US", { timeZone: template.timezone })
  );
  const todayDow = nowInTz.getDay(); // 0–6

  // Days until the next occurrence of template.dayOfWeek.
  // If today is the day (daysUntil=0) and we haven't generated yet, use today.
  // If daysUntil=0 and we already generated, the idempotency check below handles it.
  const daysUntil = (template.dayOfWeek - todayDow + 7) % 7;

  if (daysUntil > template.leadDays) {
    // Next occurrence is too far away — skip
    return false;
  }

  // Build the target date in the template's timezone
  const targetDate = new Date(nowInTz);
  targetDate.setDate(targetDate.getDate() + daysUntil);

  // Parse start/end times ("HH:MM") and build UTC timestamps
  const [startH, startM] = template.startTime.split(":").map(Number) as [number, number];
  const [endH, endM] = template.endTime.split(":").map(Number) as [number, number];

  // Construct a local datetime string and convert to UTC via Date parsing
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}`;

  // Use Intl.DateTimeFormat to find the UTC offset for this timezone on this date,
  // then compute the UTC timestamps directly.
  const localStartStr = `${dateStr}T${pad(startH)}:${pad(startM)}:00`;
  const localEndStr = `${dateStr}T${pad(endH)}:${pad(endM)}:00`;

  const startsAt = localDateTimeToUtc(localStartStr, template.timezone);
  let endsAt = localDateTimeToUtc(localEndStr, template.timezone);

  // If end is before start (e.g. template.endTime < template.startTime), add 1 day
  if (endsAt <= startsAt) {
    endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
  }

  // Idempotency: check whether an event already exists for this template whose
  // confirmedStartsAt falls within 1 hour of the computed startsAt. This window
  // accounts for DST transitions without risking duplicate generation.
  const windowStart = new Date(startsAt.getTime() - 60 * 60 * 1000);
  const windowEnd = new Date(startsAt.getTime() + 60 * 60 * 1000);

  const existingEvents = await db.query.events.findMany({
    where: and(
      eq(events.recurringTemplateId, template.id),
      gte(events.confirmedStartsAt, windowStart),
    ),
    columns: { id: true, confirmedStartsAt: true },
  });

  const alreadyGenerated = existingEvents.some(
    (e) => e.confirmedStartsAt && e.confirmedStartsAt < windowEnd
  );

  if (alreadyGenerated) {
    return false;
  }

  // Generate the event
  const eventId = createId();
  await db.insert(events).values({
    id: eventId,
    groupId: template.groupId,
    title: template.title,
    description: template.description ?? null,
    createdBy: template.createdBy,
    status: template.generatedEventStatus as "draft" | "open",
    recurringTemplateId: template.id,
    confirmedStartsAt: startsAt,
    confirmedEndsAt: endsAt,
    gameOptional: false,
  });

  console.log(
    `[recurring] generated event ${eventId} for template ${template.id} (${template.title}) on ${dateStr}`
  );

  // Optionally create a game poll
  if (template.autoPoll) {
    await maybeCreateGamePoll(eventId, template.groupId, template.createdBy);
  }

  return true;
}

/**
 * Create an open game poll on the newly generated event, pre-populated with
 * up to 5 games owned by group members (best-effort — empty if no games found).
 */
async function maybeCreateGamePoll(
  eventId: string,
  groupId: string,
  createdBy: string
): Promise<void> {
  try {
    // Find games owned by group members
    const memberIds = await db
      .selectDistinct({ userId: groupMemberships.userId })
      .from(groupMemberships)
      .where(eq(groupMemberships.groupId, groupId));

    const ownerships = memberIds.length === 0
      ? []
      : await db.query.gameOwnerships.findMany({
          where: (go, { inArray }) =>
            inArray(go.userId, memberIds.map((m) => m.userId)),
          with: { game: { columns: { id: true, title: true } } },
          limit: 5,
        });

    const pollId = createId();
    await db.insert(polls).values({
      id: pollId,
      eventId,
      groupId,
      type: "game",
      question: "What should we play?",
      allowMultipleVotes: "false",
      status: "open",
      createdBy,
    });

    if (ownerships.length > 0) {
      await db.insert(pollOptions).values(
        ownerships.map((o, i) => ({
          id: createId(),
          pollId,
          label: o.game.title,
          gameId: o.game.id,
          sortOrder: i,
        }))
      );
    }

    console.log(
      `[recurring] created auto-poll ${pollId} for event ${eventId} with ${ownerships.length} option(s)`
    );
  } catch (err) {
    // Auto-poll failure must not block event generation
    console.error(
      `[recurring] failed to create auto-poll for event ${eventId}:`,
      err
    );
  }
}

/**
 * Convert a local datetime string ("YYYY-MM-DDTHH:MM:SS") in the given IANA
 * timezone to a UTC Date object.
 *
 * Strategy: parse the local string as if it were UTC, then measure the offset
 * between that naive UTC time and what the timezone reports it as locally, and
 * subtract the difference.
 */
function localDateTimeToUtc(localStr: string, timezone: string): Date {
  // Parse as UTC-0 first (naive)
  const naiveUtc = new Date(`${localStr}Z`);

  // Format naiveUtc back in the target timezone to see what local time it maps to
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(naiveUtc).map((p) => [p.type, p.value])
  );

  const localAsUtcStr = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`;
  const localAsUtc = new Date(localAsUtcStr);

  // Offset = localAsUtc - naiveUtc (how far ahead/behind the timezone is)
  const offsetMs = localAsUtc.getTime() - naiveUtc.getTime();

  // Subtract offset to get the true UTC time
  return new Date(naiveUtc.getTime() - offsetMs);
}
