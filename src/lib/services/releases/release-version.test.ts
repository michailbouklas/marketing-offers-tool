import { describe, expect, it } from "vitest";
import { DEV_BUILD_VERSION, formatBuildVersion } from "./release-version";

describe("formatBuildVersion", () => {
  it("zero-pads month and day and truncates the sha to 7 chars", () => {
    const date = new Date(Date.UTC(2026, 0, 5, 12));
    expect(formatBuildVersion(date, "ab12cd3ef4567890")).toBe(
      "20260105-ab12cd3",
    );
  });

  it("uses the UTC date, not the local one", () => {
    // 23:30 UTC on the 5th; in UTC+2 that is already the 6th.
    const date = new Date(Date.UTC(2026, 9, 5, 23, 30));
    expect(formatBuildVersion(date, "1234567")).toBe("20261005-1234567");
  });

  it("falls back to nogit for an empty or whitespace sha", () => {
    const date = new Date(Date.UTC(2026, 9, 29));
    expect(formatBuildVersion(date, "")).toBe("20261029-nogit");
    expect(formatBuildVersion(date, "  \n")).toBe("20261029-nogit");
  });

  it("exposes the local dev fallback", () => {
    expect(DEV_BUILD_VERSION).toBe("dev");
  });
});
