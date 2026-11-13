import { describe, expect, it } from "vitest";
import { getUserStatus, summarizeUsers, type UserRecord } from "./users";

const now = new Date("2026-11-13T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

function user(lastActiveAt: Date | null, banned = false): UserRecord {
  return {
    id: crypto.randomUUID(),
    name: "U",
    email: "u@example.com",
    roles: ["user"],
    brands: [],
    createdAt: daysAgo(100),
    banned,
    lastActiveAt,
  };
}

describe("getUserStatus", () => {
  it("classifies by ban first, then by last activity", () => {
    expect(getUserStatus(user(daysAgo(1), true), now)).toBe("deactivated");
    expect(getUserStatus(user(null), now)).toBe("never");
    expect(getUserStatus(user(daysAgo(30)), now)).toBe("active");
    expect(getUserStatus(user(daysAgo(31)), now)).toBe("inactive");
  });
});

describe("summarizeUsers", () => {
  it("counts activity windows and never excludes deactivated from the total", () => {
    const summary = summarizeUsers(
      [
        user(daysAgo(2)),
        user(daysAgo(20)),
        user(daysAgo(60)),
        user(null),
        user(daysAgo(1), true),
      ],
      now,
    );
    expect(summary).toEqual({
      total: 5,
      active7d: 1,
      active30d: 2,
      deactivated: 1,
      never: 1,
    });
  });
});
