/**
 * Seed script for local development / demo.
 *
 * Creates a realistic set of users, friendships, groups, games, events,
 * polls, posts, comments, reactions, and availability schedules.
 *
 * All timestamps are anchored to "now" at seed time so the data always
 * looks current: upcoming events are always in the future, recent posts
 * always look recent.
 *
 * Run: pnpm db:seed
 *
 * Safe to re-run — skips rows that already exist.
 * Your real account (@ghasst) is included as a participant in all groups
 * and events so you can demo as yourself.
 */

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import * as schema from "./schema";
import type { WeeklySlots } from "./schema";

config({ path: ".env" });

const {
  user,
  account,
  friendships,
  groups,
  groupMemberships,
  posts,
  comments,
  reactions,
  games,
  gameOwnerships,
  availabilitySchedules,
  events,
  eventRsvps,
  polls,
  pollOptions,
  pollVotes,
} = schema;

const db = drizzle(postgres(process.env.DATABASE_URL!), { schema });

// ── Your real account ──────────────────────────────────────────────────────────
// Included in groups, events, and friendships so you can demo as yourself.
const REAL_USER_ID = "baeROxHsQHMgGuN8nipv56Teitn06UiZ";

// ── Time helpers ───────────────────────────────────────────────────────────────
// All dates anchor to "now" so re-seeding always looks current.

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

// Next occurrence of a given weekday (0=Sun … 6=Sat), at least `minDaysAhead` days from now
function nextWeekday(dow: number, minDaysAhead = 1): Date {
  const d = new Date();
  d.setDate(d.getDate() + minDaysAhead);
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
  return d;
}

function setHour(date: Date, h: number, m = 0): Date {
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

// ── Seed users ────────────────────────────────────────────────────────────────

const SEED_USERS = [
  {
    id: "seed-user-alice",
    name: "Alice",
    username: "alice",
    email: "alice@campfire.local",
    password: "password123",
    bio: "RPG and strategy obsessed. Will always suggest BG3 for co-op.",
    image: "https://api.dicebear.com/9.x/avataaars/svg?seed=alice&backgroundColor=b6e3f4",
  },
  {
    id: "seed-user-bob",
    name: "Bob",
    username: "bob",
    email: "bob@campfire.local",
    password: "password123",
    bio: "FPS enthusiast. Mostly plays late nights. Peaked at Diamond in Valorant.",
    image: "https://api.dicebear.com/9.x/avataaars/svg?seed=bob&backgroundColor=c0aede",
  },
  {
    id: "seed-user-carol",
    name: "Carol",
    username: "carol",
    email: "carol@campfire.local",
    password: "password123",
    bio: "Indie games and couch co-op. If it has a good story, I'm in.",
    image: "https://api.dicebear.com/9.x/avataaars/svg?seed=carol&backgroundColor=d1f4e0",
  },
  {
    id: "seed-user-dan",
    name: "Dan",
    username: "dan",
    email: "dan@campfire.local",
    password: "password123",
    bio: "RTS and survival games. Early evenings work best — I'm usually in bed by 11.",
    image: "https://api.dicebear.com/9.x/avataaars/svg?seed=dan&backgroundColor=ffd5dc",
  },
  {
    id: "seed-user-eve",
    name: "Eve",
    username: "eve",
    email: "eve@campfire.local",
    password: "password123",
    bio: "Horror games at night only. Join if you dare. Phasmophobia legend.",
    image: "https://api.dicebear.com/9.x/avataaars/svg?seed=eve&backgroundColor=ffdfbf",
  },
  {
    id: "seed-user-jake",
    name: "Jake",
    username: "jake",
    email: "jake@campfire.local",
    password: "password123",
    bio: "Competitive FPS grinder. Valorant, CS2, anything with a leaderboard.",
    image: "https://api.dicebear.com/9.x/avataaars/svg?seed=jake&backgroundColor=b6e3f4",
  },
  {
    id: "seed-user-mia",
    name: "Mia",
    username: "mia",
    email: "mia@campfire.local",
    password: "password123",
    bio: "Survival and crafting games. 500 hours in Minecraft and counting.",
    image: "https://api.dicebear.com/9.x/avataaars/svg?seed=mia&backgroundColor=d1f4e0",
  },
  {
    id: "seed-user-sam",
    name: "Sam",
    username: "sam",
    email: "sam@campfire.local",
    password: "password123",
    bio: "4X strategy and grand strategy. One more turn has ruined me.",
    image: "https://api.dicebear.com/9.x/avataaars/svg?seed=sam&backgroundColor=c0aede",
  },
];

const ALL_SEED_USER_IDS = SEED_USERS.map((u) => u.id);
// All seed users + your real account
const ALL_PARTICIPANT_IDS = [...ALL_SEED_USER_IDS, REAL_USER_ID];

// ── Availability ──────────────────────────────────────────────────────────────
// 0=Sun, 1=Mon … 6=Sat. All times UTC (UK evening approximation).

const SEED_AVAILABILITY: Record<string, WeeklySlots> = {
  "seed-user-alice": {
    1: [{ start: "18:30", end: "22:30", type: "available" }],
    3: [{ start: "19:00", end: "23:00", type: "available" }],
    5: [{ start: "18:00", end: "00:00", endDayOffset: 1, type: "available" }],
    6: [{ start: "18:30", end: "01:00", endDayOffset: 1, type: "available" }],
  },
  "seed-user-bob": {
    2: [{ start: "19:30", end: "01:00", endDayOffset: 1, type: "available" }],
    4: [{ start: "20:00", end: "23:30", type: "available" }],
    5: [{ start: "19:00", end: "01:00", endDayOffset: 1, type: "available" }],
    6: [{ start: "20:00", end: "01:00", endDayOffset: 1, type: "available" }],
  },
  "seed-user-carol": {
    0: [{ start: "18:00", end: "21:30", type: "available" }],
    1: [{ start: "18:30", end: "22:00", type: "available" }],
    3: [{ start: "19:00", end: "22:30", type: "available" }],
    5: [{ start: "18:30", end: "23:30", type: "available" }],
  },
  "seed-user-dan": {
    0: [{ start: "17:30", end: "21:00", type: "available" }],
    1: [{ start: "18:00", end: "21:30", type: "available" }],
    5: [{ start: "18:00", end: "22:30", type: "available" }],
    6: [{ start: "17:30", end: "23:00", type: "available" }],
  },
  "seed-user-eve": {
    3: [{ start: "20:00", end: "01:00", endDayOffset: 1, type: "available" }],
    4: [{ start: "19:30", end: "00:30", endDayOffset: 1, type: "available" }],
    5: [{ start: "19:00", end: "01:00", endDayOffset: 1, type: "available" }],
    6: [{ start: "19:30", end: "01:00", endDayOffset: 1, type: "available" }],
  },
  "seed-user-jake": {
    1: [{ start: "19:00", end: "23:00", type: "available" }],
    2: [{ start: "19:00", end: "23:00", type: "available" }],
    5: [{ start: "18:00", end: "01:00", endDayOffset: 1, type: "available" }],
    6: [{ start: "17:00", end: "01:00", endDayOffset: 1, type: "available" }],
  },
  "seed-user-mia": {
    0: [{ start: "16:00", end: "22:00", type: "available" }],
    3: [{ start: "18:30", end: "22:30", type: "available" }],
    5: [{ start: "18:00", end: "23:00", type: "available" }],
    6: [{ start: "16:00", end: "00:00", endDayOffset: 1, type: "available" }],
  },
  "seed-user-sam": {
    2: [{ start: "18:00", end: "22:00", type: "available" }],
    4: [{ start: "18:30", end: "22:30", type: "available" }],
    5: [{ start: "19:00", end: "23:30", type: "available" }],
    6: [{ start: "18:00", end: "01:00", endDayOffset: 1, type: "available" }],
  },
};

// ── Groups ────────────────────────────────────────────────────────────────────

const SEED_GROUPS = [
  {
    id: "seed-group-main",
    name: "Friday Night Squad",
    description: "The usual crew for Friday sessions. All welcome.",
    inviteToken: "seed-invite-friday",
    // alice=owner, all seed users + ghasst as members
    members: [
      { userId: "seed-user-alice", role: "owner" as const },
      { userId: "seed-user-bob", role: "member" as const },
      { userId: "seed-user-carol", role: "member" as const },
      { userId: "seed-user-dan", role: "member" as const },
      { userId: "seed-user-eve", role: "member" as const },
      { userId: "seed-user-mia", role: "member" as const },
      { userId: REAL_USER_ID, role: "admin" as const },
    ],
  },
  {
    id: "seed-group-tactical",
    name: "Tactical Unit",
    description: "Competitive FPS and strategy. Comms required.",
    inviteToken: "seed-invite-tactical",
    // bob=owner, jake, dan, sam, ghasst
    members: [
      { userId: "seed-user-bob", role: "owner" as const },
      { userId: "seed-user-jake", role: "admin" as const },
      { userId: "seed-user-dan", role: "member" as const },
      { userId: "seed-user-sam", role: "member" as const },
      { userId: REAL_USER_ID, role: "member" as const },
    ],
  },
];

// ── Games ─────────────────────────────────────────────────────────────────────

const SEED_GAMES = [
  {
    id: "seed-game-baldurs-gate",
    title: "Baldur's Gate 3",
    description: "An epic RPG with deep co-op multiplayer.",
    minPlayers: 1,
    maxPlayers: 4,
    genres: ["RPG", "Strategy"],
    coverUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1086940/header.jpg",
  },
  {
    id: "seed-game-among-us",
    title: "Among Us",
    description: "Social deduction game in space.",
    minPlayers: 4,
    maxPlayers: 15,
    genres: ["Social", "Party"],
    coverUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/945360/header.jpg",
  },
  {
    id: "seed-game-rocket-league",
    title: "Rocket League",
    description: "Soccer with rocket-powered cars.",
    minPlayers: 2,
    maxPlayers: 8,
    genres: ["Sports", "Action"],
    coverUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/252950/header.jpg",
  },
  {
    id: "seed-game-valorant",
    title: "Valorant",
    description: "5v5 tactical shooter from Riot Games.",
    minPlayers: 2,
    maxPlayers: 10,
    genres: ["FPS", "Tactical"],
    coverUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2144620/header.jpg",
  },
  {
    id: "seed-game-minecraft",
    title: "Minecraft",
    description: "Endless survival, building, and exploration.",
    minPlayers: 1,
    maxPlayers: 20,
    genres: ["Survival", "Sandbox"],
    coverUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1672970/header.jpg",
  },
  {
    id: "seed-game-deep-rock",
    title: "Deep Rock Galactic",
    description: "Co-op FPS — space dwarves vs bugs.",
    minPlayers: 1,
    maxPlayers: 4,
    genres: ["Co-op", "FPS"],
    coverUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/548430/header.jpg",
  },
  {
    id: "seed-game-phasmophobia",
    title: "Phasmophobia",
    description: "Co-op paranormal investigation horror.",
    minPlayers: 1,
    maxPlayers: 4,
    genres: ["Horror", "Co-op"],
    coverUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/739630/header.jpg",
  },
  {
    id: "seed-game-civ6",
    title: "Civilization VI",
    description: "Turn-based 4X strategy. One more turn.",
    minPlayers: 1,
    maxPlayers: 12,
    genres: ["Strategy", "4X"],
    coverUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/289070/header.jpg",
  },
];

// Game ownerships: who owns what. lastPlayedDaysAgo is fixed per entry for determinism.
const SEED_OWNERSHIPS: { userId: string; gameId: string; playtimeMinutes: number; lastPlayedDaysAgo: number }[] = [
  // Alice — RPG/co-op focus
  { userId: "seed-user-alice", gameId: "seed-game-baldurs-gate", playtimeMinutes: 8400, lastPlayedDaysAgo: 7 },
  { userId: "seed-user-alice", gameId: "seed-game-among-us", playtimeMinutes: 720, lastPlayedDaysAgo: 30 },
  { userId: "seed-user-alice", gameId: "seed-game-deep-rock", playtimeMinutes: 3200, lastPlayedDaysAgo: 3 },
  { userId: "seed-user-alice", gameId: "seed-game-minecraft", playtimeMinutes: 1800, lastPlayedDaysAgo: 14 },
  // Bob — FPS focus
  { userId: "seed-user-bob", gameId: "seed-game-valorant", playtimeMinutes: 12000, lastPlayedDaysAgo: 1 },
  { userId: "seed-user-bob", gameId: "seed-game-rocket-league", playtimeMinutes: 5400, lastPlayedDaysAgo: 5 },
  { userId: "seed-user-bob", gameId: "seed-game-deep-rock", playtimeMinutes: 2100, lastPlayedDaysAgo: 7 },
  { userId: "seed-user-bob", gameId: "seed-game-among-us", playtimeMinutes: 480, lastPlayedDaysAgo: 60 },
  // Carol — variety
  { userId: "seed-user-carol", gameId: "seed-game-among-us", playtimeMinutes: 1200, lastPlayedDaysAgo: 6 },
  { userId: "seed-user-carol", gameId: "seed-game-minecraft", playtimeMinutes: 6000, lastPlayedDaysAgo: 2 },
  { userId: "seed-user-carol", gameId: "seed-game-baldurs-gate", playtimeMinutes: 2400, lastPlayedDaysAgo: 10 },
  // Dan — strategy/survival
  { userId: "seed-user-dan", gameId: "seed-game-civ6", playtimeMinutes: 15000, lastPlayedDaysAgo: 2 },
  { userId: "seed-user-dan", gameId: "seed-game-minecraft", playtimeMinutes: 4200, lastPlayedDaysAgo: 8 },
  { userId: "seed-user-dan", gameId: "seed-game-deep-rock", playtimeMinutes: 1600, lastPlayedDaysAgo: 12 },
  // Eve — horror
  { userId: "seed-user-eve", gameId: "seed-game-phasmophobia", playtimeMinutes: 9600, lastPlayedDaysAgo: 1 },
  { userId: "seed-user-eve", gameId: "seed-game-among-us", playtimeMinutes: 960, lastPlayedDaysAgo: 6 },
  { userId: "seed-user-eve", gameId: "seed-game-deep-rock", playtimeMinutes: 800, lastPlayedDaysAgo: 20 },
  // Jake — FPS grinder
  { userId: "seed-user-jake", gameId: "seed-game-valorant", playtimeMinutes: 24000, lastPlayedDaysAgo: 0 },
  { userId: "seed-user-jake", gameId: "seed-game-rocket-league", playtimeMinutes: 8000, lastPlayedDaysAgo: 3 },
  { userId: "seed-user-jake", gameId: "seed-game-deep-rock", playtimeMinutes: 1200, lastPlayedDaysAgo: 14 },
  // Mia — survival/crafting
  { userId: "seed-user-mia", gameId: "seed-game-minecraft", playtimeMinutes: 30000, lastPlayedDaysAgo: 0 },
  { userId: "seed-user-mia", gameId: "seed-game-deep-rock", playtimeMinutes: 4800, lastPlayedDaysAgo: 4 },
  { userId: "seed-user-mia", gameId: "seed-game-among-us", playtimeMinutes: 600, lastPlayedDaysAgo: 21 },
  // Sam — strategy
  { userId: "seed-user-sam", gameId: "seed-game-civ6", playtimeMinutes: 20000, lastPlayedDaysAgo: 1 },
  { userId: "seed-user-sam", gameId: "seed-game-baldurs-gate", playtimeMinutes: 3600, lastPlayedDaysAgo: 9 },
  { userId: "seed-user-sam", gameId: "seed-game-deep-rock", playtimeMinutes: 900, lastPlayedDaysAgo: 30 },
  // Ghasst — well-rounded
  { userId: REAL_USER_ID, gameId: "seed-game-baldurs-gate", playtimeMinutes: 5200, lastPlayedDaysAgo: 7 },
  { userId: REAL_USER_ID, gameId: "seed-game-deep-rock", playtimeMinutes: 3800, lastPlayedDaysAgo: 2 },
  { userId: REAL_USER_ID, gameId: "seed-game-valorant", playtimeMinutes: 7200, lastPlayedDaysAgo: 4 },
  { userId: REAL_USER_ID, gameId: "seed-game-phasmophobia", playtimeMinutes: 2400, lastPlayedDaysAgo: 5 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`  ${msg}`);
}

async function skipOrCreate<T>(
  label: string,
  exists: () => Promise<T | undefined>,
  create: () => Promise<void>,
) {
  const found = await exists();
  if (found) {
    log(`skip  ${label}`);
  } else {
    await create();
    log(`create ${label}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Seed script must not run in production. Aborting.");
    process.exit(1);
  }

  console.log("\nSeeding database...\n");

  // ── Users + password accounts ──────────────────────────────────────────────
  for (const u of SEED_USERS) {
    await skipOrCreate(
      `user ${u.email}`,
      () => db.query.user.findFirst({ where: (t, { eq }) => eq(t.id, u.id), columns: { id: true } }),
      async () => {
        const now = new Date();
        await db.insert(user).values({
          id: u.id,
          name: u.name,
          username: u.username,
          email: u.email,
          emailVerified: true,
          bio: u.bio,
          image: u.image,
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
      },
    );
  }

  // Ensure existing seed users have their avatar image set (handles re-seeds on old data)
  for (const u of SEED_USERS) {
    if (!u.image) continue;
    const existing = await db.query.user.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.id, u.id), columns: { id: true, image: true } });
    if (existing && !existing.image) {
      await db.update(user).set({ image: u.image, updatedAt: new Date() }).where(eq(user.id, u.id));
      log(`update image for ${u.username}`);
    }
  }

  // ── Friendships: all seed users + ghasst as one big friend group ───────────
  const friendPairs: [string, string][] = [];
  for (let i = 0; i < ALL_PARTICIPANT_IDS.length; i++) {
    for (let j = i + 1; j < ALL_PARTICIPANT_IDS.length; j++) {
      friendPairs.push([ALL_PARTICIPANT_IDS[i]!, ALL_PARTICIPANT_IDS[j]!]);
    }
  }
  for (const [reqId, addId] of friendPairs) {
    await skipOrCreate(
      `friendship ${reqId} ↔ ${addId}`,
      () => db.query.friendships.findFirst({
        where: (t, { eq, and, or }) => or(
          and(eq(t.requesterId, reqId), eq(t.addresseeId, addId)),
          and(eq(t.requesterId, addId), eq(t.addresseeId, reqId)),
        ),
        columns: { requesterId: true },
      }),
      () => db.insert(friendships).values({ requesterId: reqId, addresseeId: addId, status: "accepted" }).then(() => undefined),
    );
  }

  // ── Groups + memberships ───────────────────────────────────────────────────
  for (const g of SEED_GROUPS) {
    await skipOrCreate(
      `group "${g.name}"`,
      () => db.query.groups.findFirst({ where: (t, { eq }) => eq(t.id, g.id), columns: { id: true } }),
      () => db.insert(groups).values({ id: g.id, name: g.name, description: g.description, inviteToken: g.inviteToken }).then(() => undefined),
    );
    for (const m of g.members) {
      await skipOrCreate(
        `membership ${m.userId} in ${g.id}`,
        () => db.query.groupMemberships.findFirst({
          where: (t, { eq, and }) => and(eq(t.groupId, g.id), eq(t.userId, m.userId)),
          columns: { userId: true },
        }),
        () => db.insert(groupMemberships).values({ groupId: g.id, userId: m.userId, role: m.role }).then(() => undefined),
      );
    }
  }

  // ── Availability schedules ─────────────────────────────────────────────────
  for (const [userId, slots] of Object.entries(SEED_AVAILABILITY)) {
    await skipOrCreate(
      `availability for ${userId}`,
      () => db.query.availabilitySchedules.findFirst({ where: (t, { eq }) => eq(t.userId, userId), columns: { userId: true } }),
      () => db.insert(availabilitySchedules).values({
        id: `seed-avail-${userId.replace("seed-user-", "")}`,
        userId,
        timezone: "UTC",
        slots,
      }).then(() => undefined),
    );
  }

  // ── Games ──────────────────────────────────────────────────────────────────
  for (const g of SEED_GAMES) {
    await skipOrCreate(
      `game "${g.title}"`,
      () => db.query.games.findFirst({ where: (t, { eq }) => eq(t.id, g.id), columns: { id: true } }),
      () => db.insert(games).values({
        id: g.id,
        title: g.title,
        description: g.description,
        minPlayers: g.minPlayers,
        maxPlayers: g.maxPlayers,
        genres: g.genres,
        coverUrl: g.coverUrl,
        externalSource: "manual",
      }).then(() => undefined),
    );
  }

  // ── Game ownerships ────────────────────────────────────────────────────────
  for (const o of SEED_OWNERSHIPS) {
    await skipOrCreate(
      `ownership ${o.userId} → ${o.gameId}`,
      () => db.query.gameOwnerships.findFirst({
        where: (t, { eq, and }) => and(eq(t.userId, o.userId), eq(t.gameId, o.gameId), eq(t.platform, "pc")),
        columns: { userId: true },
      }),
      () => db.insert(gameOwnerships).values({
        userId: o.userId,
        gameId: o.gameId,
        platform: "pc",
        source: "manual",
        playtimeMinutes: o.playtimeMinutes,
        lastPlayedAt: daysAgo(o.lastPlayedDaysAgo),
      }).then(() => undefined),
    );
  }

  // ── Events ────────────────────────────────────────────────────────────────
  // All anchored to current date so re-seeding keeps them current.

  const nextFriday = nextWeekday(5, 1); // next Friday
  const nextSaturday = nextWeekday(6, 1); // next Saturday
  const lastFriday = daysAgo(7);

  // Event 1: Confirmed past event (last Friday) — Friday Night Squad
  await skipOrCreate(
    "event: BG3 Last Friday",
    () => db.query.events.findFirst({ where: (t, { eq }) => eq(t.id, "seed-event-past-1"), columns: { id: true } }),
    () => db.insert(events).values({
      id: "seed-event-past-1",
      groupId: "seed-group-main",
      title: "BG3 Co-op — Act 2 continuation",
      description: "Picking up where we left off in Act 2. Bring snacks.",
      createdBy: "seed-user-alice",
      status: "confirmed",
      confirmedStartsAt: setHour(lastFriday, 19),
      confirmedEndsAt: setHour(lastFriday, 23),
      gameId: "seed-game-baldurs-gate",
      createdAt: daysAgo(10),
      updatedAt: daysAgo(7),
    }).then(() => undefined),
  );

  // RSVPs for past event
  const pastEventRsvps = [
    { userId: "seed-user-alice", status: "yes" as const },
    { userId: "seed-user-bob", status: "yes" as const },
    { userId: "seed-user-carol", status: "yes" as const },
    { userId: "seed-user-dan", status: "no" as const },
    { userId: "seed-user-eve", status: "maybe" as const },
    { userId: REAL_USER_ID, status: "yes" as const },
  ];
  for (const r of pastEventRsvps) {
    await skipOrCreate(
      `rsvp ${r.userId} → seed-event-past-1`,
      () => db.query.eventRsvps.findFirst({
        where: (t, { eq, and }) => and(eq(t.eventId, "seed-event-past-1"), eq(t.userId, r.userId)),
        columns: { userId: true },
      }),
      () => db.insert(eventRsvps).values({ eventId: "seed-event-past-1", userId: r.userId, status: r.status }).then(() => undefined),
    );
  }

  // Event 2: Confirmed upcoming event (next Friday) — Friday Night Squad
  await skipOrCreate(
    "event: Deep Rock next Friday",
    () => db.query.events.findFirst({ where: (t, { eq }) => eq(t.id, "seed-event-next-1"), columns: { id: true } }),
    () => db.insert(events).values({
      id: "seed-event-next-1",
      groupId: "seed-group-main",
      title: "Deep Rock Galactic — Hazard 5 run",
      description: "Four dwarves. Lots of bugs. Bring your best loadout.",
      createdBy: REAL_USER_ID,
      status: "confirmed",
      confirmedStartsAt: setHour(nextFriday, 20),
      confirmedEndsAt: setHour(nextFriday, 23),
      gameId: "seed-game-deep-rock",
      createdAt: daysAgo(3),
      updatedAt: daysAgo(1),
    }).then(() => undefined),
  );

  const nextEventRsvps = [
    { userId: "seed-user-alice", status: "yes" as const },
    { userId: "seed-user-bob", status: "yes" as const },
    { userId: "seed-user-carol", status: "maybe" as const },
    { userId: "seed-user-mia", status: "yes" as const },
    { userId: "seed-user-eve", status: "no" as const },
    { userId: REAL_USER_ID, status: "yes" as const },
  ];
  for (const r of nextEventRsvps) {
    await skipOrCreate(
      `rsvp ${r.userId} → seed-event-next-1`,
      () => db.query.eventRsvps.findFirst({
        where: (t, { eq, and }) => and(eq(t.eventId, "seed-event-next-1"), eq(t.userId, r.userId)),
        columns: { userId: true },
      }),
      () => db.insert(eventRsvps).values({ eventId: "seed-event-next-1", userId: r.userId, status: r.status }).then(() => undefined),
    );
  }

  // Event 3: Open event Saturday — game TBD, active poll
  await skipOrCreate(
    "event: Saturday open session",
    () => db.query.events.findFirst({ where: (t, { eq }) => eq(t.id, "seed-event-next-2"), columns: { id: true } }),
    () => db.insert(events).values({
      id: "seed-event-next-2",
      groupId: "seed-group-main",
      title: "Saturday session — game TBD",
      description: "Open session — vote for what we play!",
      createdBy: "seed-user-bob",
      status: "open",
      gameOptional: true,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    }).then(() => undefined),
  );

  const saturdayRsvps = [
    { userId: "seed-user-alice", status: "yes" as const },
    { userId: "seed-user-bob", status: "yes" as const },
    { userId: "seed-user-dan", status: "yes" as const },
    { userId: "seed-user-mia", status: "maybe" as const },
    { userId: REAL_USER_ID, status: "yes" as const },
  ];
  for (const r of saturdayRsvps) {
    await skipOrCreate(
      `rsvp ${r.userId} → seed-event-next-2`,
      () => db.query.eventRsvps.findFirst({
        where: (t, { eq, and }) => and(eq(t.eventId, "seed-event-next-2"), eq(t.userId, r.userId)),
        columns: { userId: true },
      }),
      () => db.insert(eventRsvps).values({ eventId: "seed-event-next-2", userId: r.userId, status: r.status }).then(() => undefined),
    );
  }

  // Active game poll on Saturday event
  await skipOrCreate(
    "poll: Saturday game vote",
    () => db.query.polls.findFirst({ where: (t, { eq }) => eq(t.id, "seed-poll-sat-game"), columns: { id: true } }),
    async () => {
      await db.insert(polls).values({
        id: "seed-poll-sat-game",
        eventId: "seed-event-next-2",
        type: "game",
        question: "What should we play on Saturday?",
        allowMultipleVotes: "false",
        status: "open",
        createdBy: "seed-user-bob",
        closesAt: setHour(nextSaturday, 17),
        createdAt: daysAgo(1),
      });
      await db.insert(pollOptions).values([
        { id: "seed-poll-sat-game-opt-1", pollId: "seed-poll-sat-game", gameId: "seed-game-among-us", label: "Among Us", sortOrder: 0 },
        { id: "seed-poll-sat-game-opt-2", pollId: "seed-poll-sat-game", gameId: "seed-game-phasmophobia", label: "Phasmophobia", sortOrder: 1 },
        { id: "seed-poll-sat-game-opt-3", pollId: "seed-poll-sat-game", gameId: "seed-game-deep-rock", label: "Deep Rock Galactic", sortOrder: 2 },
      ]);
    },
  );

  // Cast some votes on the Saturday poll
  const satPollVotes = [
    { optionId: "seed-poll-sat-game-opt-1", userId: "seed-user-carol" },
    { optionId: "seed-poll-sat-game-opt-1", userId: "seed-user-mia" },
    { optionId: "seed-poll-sat-game-opt-2", userId: "seed-user-eve" },
    { optionId: "seed-poll-sat-game-opt-3", userId: "seed-user-alice" },
    { optionId: "seed-poll-sat-game-opt-3", userId: "seed-user-dan" },
  ];
  for (const v of satPollVotes) {
    await skipOrCreate(
      `vote ${v.userId} → ${v.optionId}`,
      () => db.query.pollVotes.findFirst({
        where: (t, { eq, and }) => and(eq(t.pollOptionId, v.optionId), eq(t.userId, v.userId)),
        columns: { userId: true },
      }),
      () => db.insert(pollVotes).values({ pollOptionId: v.optionId, userId: v.userId }).then(() => undefined),
    );
  }

  // Event 4: Tactical Unit — Valorant scrimmage (next Saturday)
  await skipOrCreate(
    "event: Tactical Unit Valorant scrimmage",
    () => db.query.events.findFirst({ where: (t, { eq }) => eq(t.id, "seed-event-tactical-1"), columns: { id: true } }),
    () => db.insert(events).values({
      id: "seed-event-tactical-1",
      groupId: "seed-group-tactical",
      title: "Valorant Scrimmage — 5v5",
      description: "Internal scrimmage to warm up for ranked. Comms on Discord.",
      createdBy: "seed-user-jake",
      status: "open",
      gameId: "seed-game-valorant",
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
    }).then(() => undefined),
  );

  const tacticalRsvps = [
    { userId: "seed-user-bob", status: "yes" as const },
    { userId: "seed-user-jake", status: "yes" as const },
    { userId: "seed-user-dan", status: "maybe" as const },
    { userId: REAL_USER_ID, status: "yes" as const },
  ];
  for (const r of tacticalRsvps) {
    await skipOrCreate(
      `rsvp ${r.userId} → seed-event-tactical-1`,
      () => db.query.eventRsvps.findFirst({
        where: (t, { eq, and }) => and(eq(t.eventId, "seed-event-tactical-1"), eq(t.userId, r.userId)),
        columns: { userId: true },
      }),
      () => db.insert(eventRsvps).values({ eventId: "seed-event-tactical-1", userId: r.userId, status: r.status }).then(() => undefined),
    );
  }

  // ── Posts + comments + reactions ──────────────────────────────────────────

  const SEED_POSTS = [
    {
      id: "seed-post-1",
      authorId: "seed-user-alice",
      body: "Just finished the Baldur's Gate 3 Dark Urge run. Absolutely brutal ending. Who wants to do a co-op playthrough from the start?",
      groupId: null as string | null,
      createdAt: daysAgo(12),
    },
    {
      id: "seed-post-2",
      authorId: "seed-user-bob",
      body: "Finally hit Diamond in Valorant 🎉 If anyone wants to duo queue let me know — I need a reliable support player.",
      groupId: null as string | null,
      createdAt: daysAgo(9),
    },
    {
      id: "seed-post-3",
      authorId: "seed-user-carol",
      body: "Among Us tonight? Need at least 6. I'll host.",
      groupId: "seed-group-main",
      createdAt: daysAgo(6),
    },
    {
      id: "seed-post-4",
      authorId: "seed-user-eve",
      body: "Phasmophobia just dropped a massive update. New maps, new ghosts, completely redone progression. This is the perfect time to get people into it.",
      groupId: null as string | null,
      createdAt: daysAgo(5),
    },
    {
      id: "seed-post-5",
      authorId: "seed-user-mia",
      body: "Started a new Minecraft world — hardcore mode, no coords. If I die I die. Anyone want to join the server while it lasts?",
      groupId: "seed-group-main",
      createdAt: daysAgo(4),
    },
    {
      id: "seed-post-6",
      authorId: "seed-user-jake",
      body: "Scrimmage this weekend with the Tactical Unit crew. Come through if you can aim.",
      groupId: "seed-group-tactical",
      createdAt: daysAgo(2),
    },
    {
      id: "seed-post-7",
      authorId: "seed-user-dan",
      body: "600 hours into Civ VI and I still lose to the AI on Deity. At least I'm consistent.",
      groupId: null as string | null,
      createdAt: daysAgo(1),
    },
    {
      id: "seed-post-8",
      authorId: REAL_USER_ID,
      body: "Deep Rock next Friday is locked in. Hazard 5. No exceptions. See you all there 🍺",
      groupId: "seed-group-main",
      createdAt: hoursAgo(3),
    },
  ];

  for (const p of SEED_POSTS) {
    await skipOrCreate(
      `post ${p.id}`,
      () => db.query.posts.findFirst({ where: (t, { eq }) => eq(t.id, p.id), columns: { id: true } }),
      () => db.insert(posts).values({ id: p.id, authorId: p.authorId, body: p.body, groupId: p.groupId, createdAt: p.createdAt, updatedAt: p.createdAt }).then(() => undefined),
    );
  }

  const SEED_COMMENTS = [
    // On post 1 (BG3 co-op)
    { id: "seed-comment-1", postId: "seed-post-1", authorId: "seed-user-bob", body: "I'm in! Dark Urge on co-op sounds chaotic.", createdAt: daysAgo(11) },
    { id: "seed-comment-2", postId: "seed-post-1", authorId: "seed-user-carol", body: "Wait are we starting from scratch or loading a save?", createdAt: daysAgo(11) },
    { id: "seed-comment-3", postId: "seed-post-1", authorId: "seed-user-alice", body: "From scratch! Full Dark Urge, evil playthrough. Very different experience.", createdAt: daysAgo(10) },
    { id: "seed-comment-4", postId: "seed-post-1", authorId: REAL_USER_ID, body: "Count me in. I've never done the Dark Urge run.", createdAt: daysAgo(10) },
    // On post 2 (Valorant Diamond)
    { id: "seed-comment-5", postId: "seed-post-2", authorId: "seed-user-jake", body: "Congrats! What agent are you maining?", createdAt: daysAgo(8) },
    { id: "seed-comment-6", postId: "seed-post-2", authorId: "seed-user-bob", body: "Jett. Always Jett. I know, I know.", createdAt: daysAgo(8) },
    // On post 3 (Among Us)
    { id: "seed-comment-7", postId: "seed-post-3", authorId: "seed-user-dan", body: "I'm in, haven't played in ages.", createdAt: daysAgo(6) },
    { id: "seed-comment-8", postId: "seed-post-3", authorId: "seed-user-alice", body: "Same, let's do it. 8pm?", createdAt: daysAgo(6) },
    { id: "seed-comment-9", postId: "seed-post-3", authorId: "seed-user-carol", body: "8pm works, I'll send the code in Discord.", createdAt: daysAgo(5) },
    // On post 4 (Phasmophobia update)
    { id: "seed-comment-10", postId: "seed-post-4", authorId: REAL_USER_ID, body: "The new Maple Lodge Campsite map is terrifying. Highly recommend.", createdAt: daysAgo(4) },
    { id: "seed-comment-11", postId: "seed-post-4", authorId: "seed-user-carol", body: "I'll try it only if someone else goes first 😅", createdAt: daysAgo(4) },
    // On post 5 (Minecraft hardcore)
    { id: "seed-comment-12", postId: "seed-post-5", authorId: "seed-user-dan", body: "How long until you die? I give it 3 sessions.", createdAt: daysAgo(3) },
    { id: "seed-comment-13", postId: "seed-post-5", authorId: "seed-user-mia", body: "Bold prediction, Dan. I'll survive just to prove you wrong.", createdAt: daysAgo(3) },
    // On post 8 (Deep Rock)
    { id: "seed-comment-14", postId: "seed-post-8", authorId: "seed-user-alice", body: "ROCK AND STONE 🪨", createdAt: hoursAgo(2) },
    { id: "seed-comment-15", postId: "seed-post-8", authorId: "seed-user-bob", body: "FOR KARL!", createdAt: hoursAgo(1) },
  ];

  for (const c of SEED_COMMENTS) {
    await skipOrCreate(
      `comment ${c.id}`,
      () => db.query.comments.findFirst({ where: (t, { eq }) => eq(t.id, c.id), columns: { id: true } }),
      () => db.insert(comments).values({ id: c.id, postId: c.postId, authorId: c.authorId, body: c.body, createdAt: c.createdAt }).then(() => undefined),
    );
  }

  // Reactions (likes on posts)
  const SEED_REACTIONS = [
    { id: "seed-reaction-1", userId: "seed-user-bob", postId: "seed-post-1" },
    { id: "seed-reaction-2", userId: "seed-user-carol", postId: "seed-post-1" },
    { id: "seed-reaction-3", userId: REAL_USER_ID, postId: "seed-post-1" },
    { id: "seed-reaction-4", userId: "seed-user-alice", postId: "seed-post-2" },
    { id: "seed-reaction-5", userId: "seed-user-jake", postId: "seed-post-2" },
    { id: "seed-reaction-6", userId: "seed-user-alice", postId: "seed-post-4" },
    { id: "seed-reaction-7", userId: REAL_USER_ID, postId: "seed-post-4" },
    { id: "seed-reaction-8", userId: "seed-user-alice", postId: "seed-post-8" },
    { id: "seed-reaction-9", userId: "seed-user-carol", postId: "seed-post-8" },
    { id: "seed-reaction-10", userId: "seed-user-eve", postId: "seed-post-8" },
  ];

  for (const r of SEED_REACTIONS) {
    await skipOrCreate(
      `reaction ${r.id}`,
      () => db.query.reactions.findFirst({ where: (t, { eq }) => eq(t.id, r.id), columns: { id: true } }),
      () => db.insert(reactions).values({ id: r.id, userId: r.userId, postId: r.postId, type: "like" }).then(() => undefined),
    );
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\nDone.\n");
  console.log("Seed accounts (password: password123):");
  for (const u of SEED_USERS) {
    console.log(`  ${u.email}  @${u.username}`);
  }
  console.log(`\n  Your account (@ghasst) is in both groups and friends with everyone.\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
