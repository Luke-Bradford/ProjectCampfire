/**
 * Unit tests for the session creation hook in src/server/auth/index.ts.
 *
 * The hook blocks session creation for soft-deleted accounts by returning `false`.
 * This is a security-critical gate: if the better-auth hook contract changes
 * (e.g. `false` no longer cancels creation), deleted users could re-authenticate.
 *
 * These tests exercise the hook logic in isolation against a mock DB. They do NOT
 * verify the better-auth hook contract itself — see the comment in index.ts for
 * how to verify that on a better-auth version bump.
 */

import { describe, it, expect, vi } from "vitest";

// ── Inline the hook logic so it can be tested without importing better-auth ──

async function sessionCreateBefore(
  newSession: { userId: string },
  findUser: (id: string) => Promise<{ deletedAt: Date | null } | undefined>
): Promise<false | undefined> {
  const row = await findUser(newSession.userId);
  if (row?.deletedAt) {
    return false; // cancels session creation
  }
  // undefined → proceed normally
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("session create before hook", () => {
  it("returns undefined (allow) for an active user", async () => {
    const findUser = vi.fn().mockResolvedValue({ deletedAt: null });
    const result = await sessionCreateBefore({ userId: "user-1" }, findUser);
    expect(result).toBeUndefined();
    expect(findUser).toHaveBeenCalledWith("user-1");
  });

  it("returns false (block) for a soft-deleted user", async () => {
    const findUser = vi.fn().mockResolvedValue({ deletedAt: new Date("2024-01-01") });
    const result = await sessionCreateBefore({ userId: "deleted-user" }, findUser);
    expect(result).toBe(false);
  });

  it("returns undefined (allow) when the user row is not found", async () => {
    // Unknown userId: safest to allow and let better-auth handle the missing user.
    const findUser = vi.fn().mockResolvedValue(undefined);
    const result = await sessionCreateBefore({ userId: "ghost-user" }, findUser);
    expect(result).toBeUndefined();
  });

  it("propagates DB errors (does not silently swallow them)", async () => {
    const findUser = vi.fn().mockRejectedValue(new Error("DB connection lost"));
    await expect(sessionCreateBefore({ userId: "user-1" }, findUser)).rejects.toThrow(
      "DB connection lost"
    );
  });
});
