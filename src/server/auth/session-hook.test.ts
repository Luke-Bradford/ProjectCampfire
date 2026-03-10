/**
 * Unit tests for checkSessionAllowed — the session creation hook in
 * src/server/auth/index.ts that blocks soft-deleted accounts from
 * re-authenticating.
 *
 * These tests import the production function directly so any change to
 * the logic is caught immediately. The DB module is mocked to keep
 * tests fast and dependency-free.
 *
 * NOTE: These tests do NOT verify the better-auth hook contract itself
 * (i.e. that returning `false` from a `before` hook cancels session
 * creation). See the comment in index.ts for how to verify that on a
 * better-auth version bump.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB before importing the module under test so the module-level
// `db` reference resolves to the mock.
vi.mock("@/server/db", () => ({
  db: {
    query: {
      user: {
        findFirst: vi.fn(),
      },
    },
  },
}));

// Mock env so the module can be imported without real env vars set.
vi.mock("@/env", () => ({
  env: {
    AUTH_SECRET: "test-secret-that-is-at-least-32-chars-long",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    DATABASE_URL: "postgresql://test",
  },
}));

// Mock better-auth to avoid importing its full dependency tree.
vi.mock("better-auth", () => ({ betterAuth: () => ({}) }));
vi.mock("better-auth/adapters/drizzle", () => ({ drizzleAdapter: () => ({}) }));

import { db } from "@/server/db";
import { checkSessionAllowed } from "./index";

const mockFindFirst = db.query.user.findFirst as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFindFirst.mockReset();
});

describe("checkSessionAllowed", () => {
  it("returns undefined (allow) for an active user", async () => {
    mockFindFirst.mockResolvedValue({ deletedAt: null });
    const result = await checkSessionAllowed("user-1");
    expect(result).toBeUndefined();
  });

  it("returns false (block) for a soft-deleted user", async () => {
    mockFindFirst.mockResolvedValue({ deletedAt: new Date("2024-01-01") });
    const result = await checkSessionAllowed("deleted-user");
    expect(result).toBe(false);
  });

  it("returns undefined (allow) when the user row is not found", async () => {
    // Unknown userId: let better-auth handle the missing user — hook's job
    // is only to gate on soft-deletion, not general user existence.
    mockFindFirst.mockResolvedValue(undefined);
    const result = await checkSessionAllowed("ghost-user");
    expect(result).toBeUndefined();
  });

  it("propagates DB errors (does not silently swallow them)", async () => {
    mockFindFirst.mockRejectedValue(new Error("DB connection lost"));
    await expect(checkSessionAllowed("user-1")).rejects.toThrow("DB connection lost");
  });
});
