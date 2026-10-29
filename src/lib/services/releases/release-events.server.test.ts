import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getReleaseSubscriberCount,
  publishReleaseEvent,
  resetReleaseEventsForTesting,
  subscribeToReleaseEvents,
} from "./release-events.server";
import type { ReleasePublishedEvent } from "./releases";

const event: ReleasePublishedEvent = {
  type: "published",
  publishedByUserId: "u1",
  release: {
    id: 7,
    version: "20261029-abc1234",
    title: "Sweeper",
    createdAt: "2026-10-29T10:00:00.000Z",
    createdByName: "Admin",
  },
};

afterEach(() => {
  resetReleaseEventsForTesting();
  vi.restoreAllMocks();
});

describe("release events hub", () => {
  it("delivers a publish to every subscriber and honours unsubscribe", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeToReleaseEvents(a);
    subscribeToReleaseEvents(b);
    expect(getReleaseSubscriberCount()).toBe(2);

    publishReleaseEvent(event);
    expect(a).toHaveBeenCalledWith(event);
    expect(b).toHaveBeenCalledWith(event);

    offA();
    publishReleaseEvent(event);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    expect(getReleaseSubscriberCount()).toBe(1);
  });

  it("keeps delivering when one subscriber throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("closed stream");
    });
    const good = vi.fn();
    subscribeToReleaseEvents(bad);
    subscribeToReleaseEvents(good);

    expect(() => publishReleaseEvent(event)).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});
