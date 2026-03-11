import { relations } from "drizzle-orm";
import { user } from "./auth";
import { friendships } from "./friendships";
import { groups, groupMemberships } from "./groups";
import { posts, comments, reactions } from "./posts";
import { games, gameOwnerships } from "./games";
import { availabilitySchedules, availabilityOverrides } from "./availability";
import { events, eventRsvps, polls, pollOptions, pollVotes } from "./events";

export const friendshipsRelations = relations(friendships, ({ one }) => ({
  requester: one(user, {
    fields: [friendships.requesterId],
    references: [user.id],
    relationName: "requester",
  }),
  addressee: one(user, {
    fields: [friendships.addresseeId],
    references: [user.id],
    relationName: "addressee",
  }),
}));

export const userRelations = relations(user, ({ many }) => ({
  sentRequests: many(friendships, { relationName: "requester" }),
  receivedRequests: many(friendships, { relationName: "addressee" }),
  groupMemberships: many(groupMemberships),
}));

export const groupsRelations = relations(groups, ({ many }) => ({
  memberships: many(groupMemberships),
}));

export const groupMembershipsRelations = relations(groupMemberships, ({ one }) => ({
  group: one(groups, {
    fields: [groupMemberships.groupId],
    references: [groups.id],
  }),
  user: one(user, {
    fields: [groupMemberships.userId],
    references: [user.id],
  }),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(user, { fields: [posts.authorId], references: [user.id] }),
  group: one(groups, { fields: [posts.groupId], references: [groups.id] }),
  event: one(events, { fields: [posts.eventId], references: [events.id] }),
  comments: many(comments),
  reactions: many(reactions),
  repostOf: one(posts, {
    fields: [posts.repostOfId],
    references: [posts.id],
    relationName: "reposts",
  }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  author: one(user, { fields: [comments.authorId], references: [user.id] }),
  reactions: many(reactions),
}));

export const reactionsRelations = relations(reactions, ({ one }) => ({
  user: one(user, { fields: [reactions.userId], references: [user.id] }),
  post: one(posts, { fields: [reactions.postId], references: [posts.id] }),
  comment: one(comments, { fields: [reactions.commentId], references: [comments.id] }),
}));

// ── Games ─────────────────────────────────────────────────────────────────────

export const gamesRelations = relations(games, ({ many }) => ({
  ownerships: many(gameOwnerships),
  pollOptions: many(pollOptions),
  events: many(events),
}));

export const gameOwnershipsRelations = relations(gameOwnerships, ({ one }) => ({
  user: one(user, { fields: [gameOwnerships.userId], references: [user.id] }),
  game: one(games, { fields: [gameOwnerships.gameId], references: [games.id] }),
}));

// ── Availability ──────────────────────────────────────────────────────────────

export const availabilitySchedulesRelations = relations(availabilitySchedules, ({ one }) => ({
  user: one(user, { fields: [availabilitySchedules.userId], references: [user.id] }),
}));

export const availabilityOverridesRelations = relations(availabilityOverrides, ({ one }) => ({
  user: one(user, { fields: [availabilityOverrides.userId], references: [user.id] }),
}));

// ── Events ────────────────────────────────────────────────────────────────────

export const eventsRelations = relations(events, ({ one, many }) => ({
  group: one(groups, { fields: [events.groupId], references: [groups.id] }),
  createdBy: one(user, { fields: [events.createdBy], references: [user.id] }),
  game: one(games, { fields: [events.gameId], references: [games.id] }),
  rsvps: many(eventRsvps),
  polls: many(polls),
}));

export const eventRsvpsRelations = relations(eventRsvps, ({ one }) => ({
  event: one(events, { fields: [eventRsvps.eventId], references: [events.id] }),
  user: one(user, { fields: [eventRsvps.userId], references: [user.id] }),
}));

export const pollsRelations = relations(polls, ({ one, many }) => ({
  event: one(events, { fields: [polls.eventId], references: [events.id] }),
  group: one(groups, { fields: [polls.groupId], references: [groups.id] }),
  createdBy: one(user, { fields: [polls.createdBy], references: [user.id] }),
  options: many(pollOptions),
}));

export const pollOptionsRelations = relations(pollOptions, ({ one, many }) => ({
  poll: one(polls, { fields: [pollOptions.pollId], references: [polls.id] }),
  game: one(games, { fields: [pollOptions.gameId], references: [games.id] }),
  votes: many(pollVotes),
}));

export const pollVotesRelations = relations(pollVotes, ({ one }) => ({
  option: one(pollOptions, { fields: [pollVotes.pollOptionId], references: [pollOptions.id] }),
  user: one(user, { fields: [pollVotes.userId], references: [user.id] }),
}));
