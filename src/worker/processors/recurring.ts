import type { Job } from "bullmq";
import { and, eq, gte, lte } from "drizzle-orm";
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

async function generateRecurringEvents(): Promise<void> {
  const templates = await db.query.recurringTemplates.findMany({
    where: eq(recurringTemplates.active, true),
  });

  if (templates.length === 0) {
    console.log("[recurring] generate_recurring_events: no active templates");
    return;
  }

  let totalGenerated = 0;
  let totalFailed = 0;

  for (const template of templates) {
    const results = await Promise.allSettled(
      candidateDates(template).map((d) => maybeGenerateEvent(template, d))
    );
    totalGenerated += results.filter(
      (r) => r.status === "fulfilled" && r.value === true
    ).length;
    totalFailed += results.filter((r) => r.status === "rejected").length;
  }

  console.log(
    `[recurring] generate_recurring_events: checked ${templates.length} template(s), generated ${totalGenerated}, failed ${totalFailed}`
  );
}

type RecurringTemplate = typeof recurringTemplates.$inferSelect;

/**
 * Return all occurrence dates of the template's day-of-week that fall within
 * the next `leadDays` days (in the template's timezone), starting from today.
 *
 * Example: dayOfWeek=5 (Friday), leadDays=14 → up to 2 Fridays.
 * Example: dayOfWeek=5, leadDays=7 → exactly 1 Friday (today or within 7 days).
 *
 * Uses Intl.DateTimeFormat to reliably extract the current weekday in the
 * template's timezone without relying on the server's local timezone.
 */
function candidateDates(template: RecurringTemplate): string[] {
  const now = new Date();
  const dates: string[] = [];

  // Build a candidate for each possible occurrence within the lead window.
  // Use Intl.DateTimeFormat (via getDateParts) to extract the weekday in the
  // template's timezone — arithmetic like (todayDow + offset) % 7 is incorrect
  // near UTC midnight where adding days in UTC != adding days in local time.
  for (let offset = 0; offset <= template.leadDays; offset++) {
    const candidateUtc = new Date(now);
    candidateUtc.setUTCDate(candidateUtc.getUTCDate() + offset);
    const candidateParts = getDateParts(candidateUtc, template.timezone);
    if (candidateParts.weekday === template.dayOfWeek) {
      dates.push(
        `${candidateParts.year}-${pad(candidateParts.month)}-${pad(candidateParts.day)}`
      );
    }
  }

  return dates;
}

/**
 * Generate an event for `template` on local date `localDateStr` (YYYY-MM-DD
 * in the template's timezone), unless one already exists within a ±1h window.
 *
 * Returns true if an event was generated, false if skipped.
 */
async function maybeGenerateEvent(
  template: RecurringTemplate,
  localDateStr: string
): Promise<boolean> {
  const [startH, startM] = template.startTime.split(":").map(Number) as [number, number];
  const [endH, endM] = template.endTime.split(":").map(Number) as [number, number];

  const startsAt = localDateTimeToUtc(
    `${localDateStr}T${pad(startH)}:${pad(startM)}:00`,
    template.timezone
  );
  let endsAt = localDateTimeToUtc(
    `${localDateStr}T${pad(endH)}:${pad(endM)}:00`,
    template.timezone
  );

  // If end is before or equal to start (overnight session), add 1 day to endsAt
  if (endsAt <= startsAt) {
    endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
  }

  // Idempotency: check whether an event already exists for this template whose
  // confirmedStartsAt falls within ±1h of the computed startsAt. This window
  // accounts for DST transitions (no timezone shifts more than 1h).
  const windowStart = new Date(startsAt.getTime() - 60 * 60 * 1000);
  const windowEnd = new Date(startsAt.getTime() + 60 * 60 * 1000);

  const existingEvents = await db.query.events.findMany({
    where: and(
      eq(events.recurringTemplateId, template.id),
      gte(events.confirmedStartsAt, windowStart),
      lte(events.confirmedStartsAt, windowEnd),
    ),
    columns: { id: true },
  });

  if (existingEvents.length > 0) {
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
    `[recurring] generated event ${eventId} for template ${template.id} (${template.title}) on ${localDateStr}`
  );

  if (template.autoPoll) {
    await maybeCreateGamePoll(eventId, template.groupId, template.createdBy);
  }

  return true;
}

/**
 * Create an open game poll on the newly generated event, pre-populated with
 * up to 5 *distinct* games owned by group members (best-effort).
 */
async function maybeCreateGamePoll(
  eventId: string,
  groupId: string,
  createdBy: string
): Promise<void> {
  try {
    const memberIds = await db
      .selectDistinct({ userId: groupMemberships.userId })
      .from(groupMemberships)
      .where(eq(groupMemberships.groupId, groupId));

    // Deduplicate by gameId to avoid duplicate poll options for shared games
    const seenGameIds = new Set<string>();
    const uniqueGames: { id: string; title: string }[] = [];

    if (memberIds.length > 0) {
      const ownerships = await db.query.gameOwnerships.findMany({
        where: (go, { inArray }) =>
          inArray(go.userId, memberIds.map((m) => m.userId)),
        with: { game: { columns: { id: true, title: true } } },
      });

      for (const o of ownerships) {
        if (!seenGameIds.has(o.game.id) && uniqueGames.length < 5) {
          seenGameIds.add(o.game.id);
          uniqueGames.push(o.game);
        }
      }
    }

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

    if (uniqueGames.length > 0) {
      await db.insert(pollOptions).values(
        uniqueGames.map((g, i) => ({
          id: createId(),
          pollId,
          label: g.title,
          gameId: g.id,
          sortOrder: i,
        }))
      );
    }

    console.log(
      `[recurring] created auto-poll ${pollId} for event ${eventId} with ${uniqueGames.length} option(s)`
    );
  } catch (err) {
    // Auto-poll failure must not block event generation
    console.error(
      `[recurring] failed to create auto-poll for event ${eventId}:`,
      err
    );
  }
}

// ── Timezone utilities ────────────────────────────────────────────────────────

type DateParts = {
  year: number;
  month: number; // 1-based
  day: number;
  weekday: number; // 0=Sunday, 1=Monday, …, 6=Saturday
};

/**
 * Extract local date components (year, month, day, weekday) for a given
 * instant in a named IANA timezone using Intl.DateTimeFormat.
 *
 * This is the only correct cross-platform way to get timezone-aware date parts
 * in Node.js without an external library.
 */
function getDateParts(date: Date, timezone: string): DateParts {
  // Use "en-US" numeric parts to get unambiguous numbers
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short", // "Sun", "Mon", …
  });

  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));

  // Map short weekday name to 0–6 (JS convention)
  const WEEKDAY_MAP: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAY_MAP[parts.weekday as string] ?? 0,
  };
}

/**
 * Convert a local datetime string ("YYYY-MM-DDTHH:MM:SS") in the given IANA
 * timezone to a UTC Date.
 *
 * Strategy: treat the string as UTC-0 (naive), then measure the offset between
 * that naive instant and what it looks like in the target timezone, and correct.
 */
function localDateTimeToUtc(localStr: string, timezone: string): Date {
  const naiveUtc = new Date(`${localStr}Z`);

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

  const localAsUtcStr =
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`;
  const localAsUtc = new Date(localAsUtcStr);

  const offsetMs = localAsUtc.getTime() - naiveUtc.getTime();
  return new Date(naiveUtc.getTime() - offsetMs);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
