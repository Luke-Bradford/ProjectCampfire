/**
 * Seed script for local development.
 * Creates test accounts, friendships, groups, posts, and games.
 *
 * Run: pnpm db:seed
 *
 * Safe to re-run — skips rows that already exist.
 */

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";
import * as schema from "./schema";
import type { WeeklySlots } from "./schema";

config({ path: ".env" });

const { user, account, friendships, groups, groupMemberships, posts, comments, games, gameOwnerships, availabilitySchedules } = schema;

const db = drizzle(postgres(process.env.DATABASE_URL!), { schema });

// ── Seed data ─────────────────────────────────────────────────────────────────

const SEED_USERS = [
  {
    id: "seed-user-alice",
    name: "Alice",
    username: "alice",
    email: "alice@campfire.local",
    password: "password123",
    bio: "Loves RPGs and strategy games.",
  },
  {
    id: "seed-user-bob",
    name: "Bob",
    username: "bob",
    email: "bob@campfire.local",
    password: "password123",
    bio: "FPS enthusiast. Mostly plays late nights.",
  },
  {
    id: "seed-user-carol",
    name: "Carol",
    username: "carol",
    email: "carol@campfire.local",
    password: "password123",
    bio: "Indie games and couch co-op.",
  },
  {
    id: "seed-user-dan",
    name: "Dan",
    username: "dan",
    email: "dan@campfire.local",
    password: "password123",
    bio: "RTS and survival games. Early evenings work best.",
  },
  {
    id: "seed-user-eve",
    name: "Eve",
    username: "eve",
    email: "eve@campfire.local",
    password: "password123",
    bio: "Horror games at night. Join if you dare.",
  },
];

// ── Availability schedules ─────────────────────────────────────────────────────
// Day-of-week: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
// All times in UTC (representative of UK evening, no DST for seed simplicity).
// Fuzzy starts 18:00–19:30, fuzzy ends 21:30–01:00+1.
// Designed so Fri+Sat always have 3+ people overlapping around 19:00–22:00.

const SEED_AVAILABILITY: Record<string, WeeklySlots> = {
  "seed-user-alice": {
    // Free: Mon, Wed, Fri, Sat
    1: [{ start: "18:30", end: "22:30", type: "available" }],
    3: [{ start: "19:00", end: "23:00", type: "available" }],
    5: [{ start: "18:00", end: "00:00", endDayOffset: 1, type: "available" }],
    6: [{ start: "18:30", end: "01:00", endDayOffset: 1, type: "available" }],
  },
  "seed-user-bob": {
    // Free: Tue, Thu, Fri, Sat — late-night person
    2: [{ start: "19:30", end: "01:00", endDayOffset: 1, type: "available" }],
    4: [{ start: "20:00", end: "23:30", type: "available" }],
    5: [{ start: "19:00", end: "01:00", endDayOffset: 1, type: "available" }],
    6: [{ start: "20:00", end: "01:00", endDayOffset: 1, type: "available" }],
  },
  "seed-user-carol": {
    // Free: Mon, Wed, Fri, Sun
    0: [{ start: "18:00", end: "21:30", type: "available" }],
    1: [{ start: "18:30", end: "22:00", type: "available" }],
    3: [{ start: "19:00", end: "22:30", type: "available" }],
    5: [{ start: "18:30", end: "23:30", type: "available" }],
  },
  "seed-user-dan": {
    // Free: Mon, Fri, Sat, Sun — early evenings
    0: [{ start: "17:30", end: "21:00", type: "available" }],
    1: [{ start: "18:00", end: "21:30", type: "available" }],
    5: [{ start: "18:00", end: "22:30", type: "available" }],
    6: [{ start: "17:30", end: "23:00", type: "available" }],
  },
  "seed-user-eve": {
    // Free: Wed, Thu, Fri, Sat — horror-night owl
    3: [{ start: "20:00", end: "01:00", endDayOffset: 1, type: "available" }],
    4: [{ start: "19:30", end: "00:30", endDayOffset: 1, type: "available" }],
    5: [{ start: "19:00", end: "01:00", endDayOffset: 1, type: "available" }],
    6: [{ start: "19:30", end: "01:00", endDayOffset: 1, type: "available" }],
  },
};

// IDs of all seed users — used for friendship/membership generation
const ALL_SEED_USER_IDS = SEED_USERS.map((u) => u.id);

const SEED_GROUP = {
  id: "seed-group-main",
  name: "Friday Night Squad",
  description: "The usual crew for Friday sessions.",
  inviteToken: "seed-invite-friday",
};

const SEED_GAMES = [
  {
    id: "seed-game-baldurs-gate",
    title: "Baldur's Gate 3",
    description: "An epic RPG with deep co-op multiplayer.",
    minPlayers: 1,
    maxPlayers: 4,
    genres: ["RPG", "Strategy"],
  },
  {
    id: "seed-game-among-us",
    title: "Among Us",
    description: "Social deduction game in space.",
    minPlayers: 4,
    maxPlayers: 15,
    genres: ["Social", "Party"],
  },
  {
    id: "seed-game-rocket-league",
    title: "Rocket League",
    description: "Soccer with rocket-powered cars.",
    minPlayers: 2,
    maxPlayers: 8,
    genres: ["Sports", "Action"],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`  ${msg}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Guard: seed data is for local development only.
  if (process.env.NODE_ENV === "production") {
    console.error("Seed script must not run in production. Aborting.");
    process.exit(1);
  }

  console.log("\nSeeding database...\n");

  // Users + password accounts
  for (const u of SEED_USERS) {
    const existing = await db.query.user.findFirst({
      where: (t, { eq }) => eq(t.id, u.id),
      columns: { id: true },
    });

    if (existing) {
      log(`skip  user ${u.email} (already exists)`);
      continue;
    }

    const now = new Date();
    await db.insert(user).values({
      id: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      emailVerified: true,
      bio: u.bio,
      profileVisibility: "open",
      notificationPrefs: {},
      createdAt: now,
      updatedAt: now,
    });

    const hashed = await hashPassword(u.password);
    await db.insert(account).values({
      id: `seed-account-${u.username}`,
      accountId: u.id,
      providerId: "credential",
      userId: u.id,
      password: hashed,
      createdAt: now,
      updatedAt: now,
    });

    log(`create user ${u.email}`);
  }

  // Friendships: all seed users are friends with each other (all-pairs)
  const friendPairs: [string, string][] = [];
  for (let i = 0; i < ALL_SEED_USER_IDS.length; i++) {
    for (let j = i + 1; j < ALL_SEED_USER_IDS.length; j++) {
      friendPairs.push([ALL_SEED_USER_IDS[i]!, ALL_SEED_USER_IDS[j]!]);
    }
  }

  for (const [reqId, addId] of friendPairs) {
    const existing = await db.query.friendships.findFirst({
      where: (t, { eq, and }) =>
        and(eq(t.requesterId, reqId), eq(t.addresseeId, addId)),
      columns: { requesterId: true },
    });
    if (existing) {
      log(`skip  friendship ${reqId} ↔ ${addId}`);
      continue;
    }
    await db.insert(friendships).values({
      requesterId: reqId,
      addresseeId: addId,
      status: "accepted",
    });
    log(`create friendship ${reqId} ↔ ${addId}`);
  }

  // Group
  const existingGroup = await db.query.groups.findFirst({
    where: (t, { eq }) => eq(t.id, SEED_GROUP.id),
    columns: { id: true },
  });

  if (!existingGroup) {
    await db.insert(groups).values(SEED_GROUP);
    log(`create group "${SEED_GROUP.name}"`);
  } else {
    log(`skip  group "${SEED_GROUP.name}" (already exists)`);
  }

  // Group memberships — all seed users, alice as owner
  const seedMemberships = SEED_USERS.map((u, i) => ({
    userId: u.id,
    role: (i === 0 ? "owner" : "member") as "owner" | "member",
  }));
  for (const m of seedMemberships) {
    const existing = await db.query.groupMemberships.findFirst({
      where: (t, { eq, and }) =>
        and(eq(t.groupId, SEED_GROUP.id), eq(t.userId, m.userId)),
      columns: { userId: true },
    });
    if (existing) {
      log(`skip  membership ${m.userId} in ${SEED_GROUP.id}`);
      continue;
    }
    await db.insert(groupMemberships).values({ groupId: SEED_GROUP.id, ...m });
    log(`create membership ${m.userId} in ${SEED_GROUP.id}`);
  }

  // Availability schedules — weekly recurring templates
  for (const [userId, slots] of Object.entries(SEED_AVAILABILITY)) {
    const existing = await db.query.availabilitySchedules.findFirst({
      where: (t, { eq }) => eq(t.userId, userId),
      columns: { userId: true },
    });
    if (existing) {
      log(`skip  availability schedule for ${userId}`);
      continue;
    }
    await db.insert(availabilitySchedules).values({
      id: `seed-avail-${userId.replace("seed-user-", "")}`,
      userId,
      timezone: "UTC",
      slots,
    });
    log(`create availability schedule for ${userId}`);
  }

  // Games
  for (const g of SEED_GAMES) {
    const existing = await db.query.games.findFirst({
      where: (t, { eq }) => eq(t.id, g.id),
      columns: { id: true },
    });
    if (existing) {
      log(`skip  game "${g.title}"`);
      continue;
    }
    await db.insert(games).values({
      id: g.id,
      title: g.title,
      description: g.description,
      minPlayers: g.minPlayers,
      maxPlayers: g.maxPlayers,
      genres: g.genres,
      externalSource: "manual",
    });
    log(`create game "${g.title}"`);
  }

  // Game ownerships: alice owns all three, bob owns Rocket League
  const ownerships: { userId: string; gameId: string; platform: "pc" }[] = [
    ...SEED_GAMES.map((g) => ({ userId: "seed-user-alice", gameId: g.id, platform: "pc" as const })),
    { userId: "seed-user-bob", gameId: "seed-game-rocket-league", platform: "pc" as const },
  ];

  for (const o of ownerships) {
    const existing = await db.query.gameOwnerships.findFirst({
      where: (t, { eq, and }) =>
        and(eq(t.userId, o.userId), eq(t.gameId, o.gameId), eq(t.platform, o.platform)),
      columns: { userId: true },
    });
    if (existing) {
      log(`skip  ownership ${o.userId} → ${o.gameId}`);
      continue;
    }
    await db.insert(gameOwnerships).values({ ...o, source: "manual" });
    log(`create ownership ${o.userId} → ${o.gameId}`);
  }

  // Posts: a few from alice and bob
  const SEED_POSTS = [
    {
      id: "seed-post-1",
      authorId: "seed-user-alice",
      body: "Just finished Baldur's Gate 3 — Act 3 is incredible. Who's up for a co-op run?",
      groupId: null as string | null,
    },
    {
      id: "seed-post-2",
      authorId: "seed-user-bob",
      body: "Anyone free Friday evening for some Rocket League? 🚗",
      groupId: null as string | null,
    },
    {
      id: "seed-post-3",
      authorId: "seed-user-carol",
      body: "Among Us tonight? Need at least 5 people.",
      groupId: SEED_GROUP.id,
    },
  ];

  for (const p of SEED_POSTS) {
    const existing = await db.query.posts.findFirst({
      where: (t, { eq }) => eq(t.id, p.id),
      columns: { id: true },
    });
    if (existing) {
      log(`skip  post ${p.id}`);
      continue;
    }
    await db.insert(posts).values(p);
    log(`create post ${p.id}`);
  }

  // Comments on post 1
  const existingComment = await db.query.comments.findFirst({
    where: (t, { eq }) => eq(t.id, "seed-comment-1"),
    columns: { id: true },
  });
  if (!existingComment) {
    await db.insert(comments).values({
      id: "seed-comment-1",
      postId: "seed-post-1",
      authorId: "seed-user-bob",
      body: "I'm in! What time works for you?",
    });
    log(`create comment seed-comment-1`);
  } else {
    log(`skip  comment seed-comment-1`);
  }

  console.log("\nDone.\n");
  console.log("Test accounts (password: password123):");
  for (const u of SEED_USERS) {
    console.log(`  ${u.email}  @${u.username}`);
  }
  console.log();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
