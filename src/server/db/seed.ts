/**
 * Seed script for local development.
 * Creates test accounts, friendships, and a group.
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

config({ path: ".env" });

const { user, account, friendships, groups, groupMemberships } = schema;

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
];

const SEED_GROUP = {
  id: "seed-group-main",
  name: "Friday Night Squad",
  description: "The usual crew for Friday sessions.",
  inviteToken: "seed-invite-friday",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`  ${msg}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
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

  // Friendships: alice ↔ bob (accepted), alice ↔ carol (accepted)
  const friendPairs: [string, string][] = [
    ["seed-user-alice", "seed-user-bob"],
    ["seed-user-alice", "seed-user-carol"],
  ];

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

    // Add all three users to the group
    const memberships = SEED_USERS.map((u, i) => ({
      groupId: SEED_GROUP.id,
      userId: u.id,
      role: (i === 0 ? "owner" : "member") as "owner" | "member",
    }));
    await db.insert(groupMemberships).values(memberships);
    log(`create group memberships (alice=owner, bob+carol=member)`);
  } else {
    log(`skip  group "${SEED_GROUP.name}" (already exists)`);
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
