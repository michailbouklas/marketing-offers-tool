import { describe, expect, it } from "vitest";
import {
  ALL_TIME_FROM,
  addDays,
  resolveDayRange,
  splitAtCursor,
  todayInZone,
} from "./page-view-days";

describe("todayInZone", () => {
  it("uses the activity timezone, not UTC", () => {
    // 22:30 UTC on Oct 22 is already Oct 23 in Nicosia (UTC+3 in summer time).
    const instant = new Date("2026-10-22T22:30:00Z");
    expect(todayInZone("Europe/Nicosia", instant)).toBe("2026-10-23");
    expect(todayInZone("UTC", instant)).toBe("2026-10-22");
  });
});

describe("addDays", () => {
  it("crosses month and DST boundaries by calendar day", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-29", -1)).toBe("2026-03-28");
    expect(addDays("2026-01-01", -180)).toBe("2025-07-05");
  });
});

describe("resolveDayRange", () => {
  const today = "2026-10-23";

  it("treats no params as all time through today", () => {
    expect(resolveDayRange(null, null, today)).toEqual({
      from: ALL_TIME_FROM,
      to: today,
    });
  });

  it("keeps valid bounds and swaps a reversed range", () => {
    expect(resolveDayRange("2026-10-01", "2026-10-10", today)).toEqual({
      from: "2026-10-01",
      to: "2026-10-10",
    });
    expect(resolveDayRange("2026-10-10", "2026-10-01", today)).toEqual({
      from: "2026-10-01",
      to: "2026-10-10",
    });
  });

  it("ignores malformed and impossible dates", () => {
    expect(resolveDayRange("2026-02-30", "garbage", today)).toEqual({
      from: ALL_TIME_FROM,
      to: today,
    });
  });
});

describe("splitAtCursor", () => {
  const range = { from: "2026-10-01", to: "2026-10-23" };

  it("serves everything from raw before the first rollup", () => {
    expect(splitAtCursor(range, null)).toEqual({ rollup: null, raw: range });
  });

  it("splits at the cursor: rollup through it, raw after it", () => {
    expect(splitAtCursor(range, "2026-10-21")).toEqual({
      rollup: { from: "2026-10-01", to: "2026-10-21" },
      raw: { from: "2026-10-22", to: "2026-10-23" },
    });
  });

  it("uses only rollups when the range ends on or before the cursor", () => {
    expect(splitAtCursor(range, "2026-10-23")).toEqual({
      rollup: range,
      raw: null,
    });
  });

  it("uses only raw when the cursor is before the range", () => {
    expect(splitAtCursor(range, "2026-09-30")).toEqual({
      rollup: null,
      raw: range,
    });
  });
});
