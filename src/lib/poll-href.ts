/**
 * Returns the canonical URL for a poll — events take priority, then group, then fallback.
 */
export function pollHref(poll: { groupId: string | null; eventId: string | null }): string {
  if (poll.eventId) return `/events/${poll.eventId}`;
  if (poll.groupId) return `/groups/${poll.groupId}`;
  return "/";
}
