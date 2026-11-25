import { describe, expect, it } from "vitest";
import { groupSessions, parseOpenKeys } from "./session-groups";

describe("groupSessions", () => {
  // Local time on purpose: groups follow the viewer's calendar day.
  const now = new Date(2026, 10, 25, 15, 0);
  const at = (day: number, hour = 12) =>
    new Date(2026, 10, day, hour).toISOString();
  const session = (key: string, updatedAt: string | null, pinned = false) => ({
    key,
    updatedAt,
    pinned,
  });

  it("groups by calendar day, pinned first, and drops empty groups", () => {
    const groups = groupSessions(
      [
        session("today", at(25, 0)),
        session("pinned-old", at(1), true),
        session("yesterday", at(24, 23)),
        session("week", at(18, 0)),
        session("older", at(17, 23)),
        session("undated", null),
      ],
      now,
    );

    expect(
      groups.map((group) => [group.label, group.sessions.map((s) => s.key)]),
    ).toEqual([
      ["Pinned", ["pinned-old"]],
      ["Today", ["today"]],
      ["Yesterday", ["yesterday"]],
      ["Previous 7 days", ["week"]],
      ["Older", ["older", "undated"]],
    ]);

    expect(groupSessions([session("only", at(25))], now)).toHaveLength(1);
    expect(groupSessions([], now)).toEqual([]);
  });
});

describe("parseOpenKeys", () => {
  it("returns the stored string keys and survives bad input", () => {
    expect(parseOpenKeys('["a","b"]')).toEqual(["a", "b"]);
    expect(parseOpenKeys('["a",1,null]')).toEqual(["a"]);
    expect(parseOpenKeys(null)).toEqual([]);
    expect(parseOpenKeys("{not json")).toEqual([]);
    expect(parseOpenKeys('{"a":1}')).toEqual([]);
  });
});
