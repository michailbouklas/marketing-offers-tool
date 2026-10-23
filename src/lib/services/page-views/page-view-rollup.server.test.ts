import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/prisma", () => ({ prisma: {} }));
vi.mock("$lib/server/pg-advisory-lock", () => ({
  tryAcquireAdvisoryLock: vi.fn(),
}));

const { purgeBoundary, rollupWindow } =
  await import("./page-view-rollup.server");

const today = "2026-10-23";

describe("rollupWindow", () => {
  it("starts at the first raw day on the very first run", () => {
    expect(rollupWindow(null, "2026-10-20", today, 180)).toEqual({
      from: "2026-10-20",
      to: "2026-10-22",
    });
  });

  it("re-does the two days before the cursor, through yesterday", () => {
    expect(rollupWindow("2026-10-21", null, today, 180)).toEqual({
      from: "2026-10-19",
      to: "2026-10-22",
    });
  });

  it("does nothing when there is no raw data and no cursor", () => {
    expect(rollupWindow(null, null, today, 180)).toBeNull();
  });

  it("does nothing when the only raw data is from today", () => {
    expect(rollupWindow(null, today, today, 180)).toBeNull();
  });

  it("rolls up every raw day on the first run, even past retention", () => {
    // Nothing has been purged before the first run, so old days are complete.
    expect(rollupWindow(null, "2026-01-01", today, 180)).toEqual({
      from: "2026-01-01",
      to: "2026-10-22",
    });
  });

  it("skips redo days past retention after a long outage, but no unrolled day", () => {
    // Cursor stuck at Apr 1 (cutoff is Apr 26): Mar 30-Apr 1 may be partly
    // purged and are not redone; everything from Apr 2 has never been rolled
    // up or purged, so it all is.
    expect(rollupWindow("2026-04-01", null, today, 180)).toEqual({
      from: "2026-04-02",
      to: "2026-10-22",
    });
  });

  it("re-does only the last two days when the cursor is current", () => {
    expect(rollupWindow("2026-10-22", null, today, 180)).toEqual({
      from: "2026-10-20",
      to: "2026-10-22",
    });
  });
});

describe("purgeBoundary", () => {
  it("keeps the retention window when the cursor is current", () => {
    expect(purgeBoundary(today, "2026-10-22", 180)).toBe("2026-04-26");
  });

  it("never purges past the cursor when rollups have fallen behind", () => {
    // Cursor stuck 200 days ago: only days up to it may go.
    expect(purgeBoundary(today, "2026-04-06", 180)).toBe("2026-04-07");
  });
});
