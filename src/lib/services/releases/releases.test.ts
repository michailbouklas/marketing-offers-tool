import { describe, expect, it } from "vitest";
import {
  buildReleaseInboxItems,
  markReleaseReadRequestSchema,
  releasePublishedEventSchema,
  type ReleaseSummary,
} from "./releases";
import {
  editReleaseFormSchema,
  normalizeReleaseBody,
  releaseFormSchema,
  RELEASE_TITLE_MAX_LENGTH,
} from "./release-form";

function summary(id: number, createdAt: string): ReleaseSummary {
  return {
    id,
    version: "dev",
    title: `Release ${id}`,
    createdAt,
    createdByName: null,
  };
}

describe("buildReleaseInboxItems", () => {
  const rows = [
    summary(1, "2026-10-01T00:00:00.000Z"),
    summary(3, "2026-10-03T00:00:00.000Z"),
    summary(2, "2026-10-02T00:00:00.000Z"),
  ];

  it("sorts newest first, flags read state and picks the newest unread", () => {
    const result = buildReleaseInboxItems(rows, new Set([3]));
    expect(result.items.map((item) => item.id)).toEqual([3, 2, 1]);
    expect(result.items.map((item) => item.read)).toEqual([true, false, false]);
    expect(result.unreadCount).toBe(2);
    expect(result.newestUnreadId).toBe(2);
  });

  it("returns no newest unread when everything is read", () => {
    const result = buildReleaseInboxItems(rows, new Set([1, 2, 3]));
    expect(result.unreadCount).toBe(0);
    expect(result.newestUnreadId).toBeNull();
  });

  it("breaks createdAt ties by id", () => {
    const same = [
      summary(5, "2026-10-05T00:00:00.000Z"),
      summary(6, "2026-10-05T00:00:00.000Z"),
    ];
    expect(
      buildReleaseInboxItems(same, new Set()).items.map((item) => item.id),
    ).toEqual([6, 5]);
  });
});

describe("schemas", () => {
  it("accepts a published event and rejects one without the publisher", () => {
    const event = {
      type: "published",
      publishedByUserId: "u1",
      release: summary(1, "2026-10-01T00:00:00.000Z"),
    };
    expect(releasePublishedEventSchema.safeParse(event).success).toBe(true);
    expect(
      releasePublishedEventSchema.safeParse({ ...event, publishedByUserId: 1 })
        .success,
    ).toBe(false);
  });

  it("accepts both mark-read request shapes", () => {
    expect(markReleaseReadRequestSchema.safeParse({ all: true }).success).toBe(
      true,
    );
    expect(
      markReleaseReadRequestSchema.safeParse({ releaseId: 4 }).success,
    ).toBe(true);
    expect(markReleaseReadRequestSchema.safeParse({ all: false }).success).toBe(
      false,
    );
    expect(markReleaseReadRequestSchema.safeParse({}).success).toBe(false);
  });

  it("trims and bounds the release form", () => {
    const ok = releaseFormSchema.safeParse({ title: "  v1  ", body: " # Hi " });
    expect(ok.success).toBe(true);
    expect(ok.data).toEqual({ title: "v1", body: "# Hi" });
    expect(
      releaseFormSchema.safeParse({ title: "   ", body: "x" }).success,
    ).toBe(false);
    expect(
      releaseFormSchema.safeParse({
        title: "a".repeat(RELEASE_TITLE_MAX_LENGTH + 1),
        body: "x",
      }).success,
    ).toBe(false);
  });

  it("coerces the edit form id from FormData and rejects missing or zero ids", () => {
    const ok = editReleaseFormSchema.safeParse({
      id: "7",
      title: "t",
      body: "b",
    });
    expect(ok.success).toBe(true);
    expect(ok.data?.id).toBe(7);
    expect(
      editReleaseFormSchema.safeParse({ id: "0", title: "t", body: "b" })
        .success,
    ).toBe(false);
    expect(
      editReleaseFormSchema.safeParse({ title: "t", body: "b" }).success,
    ).toBe(false);
  });

  it("normalises newlines in the body", () => {
    expect(normalizeReleaseBody("a\r\nb\rc\n")).toBe("a\nb\nc");
  });
});
