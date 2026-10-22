import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPresenceSnapshot,
  removeTab,
  resetPresenceRegistry,
  subscribeToPresence,
  sweepStaleTabs,
  upsertTab,
  type PresenceUser,
} from "./presence-registry.server";
import { PRESENCE_TTL_MS } from "./presence";

const alice: PresenceUser = {
  id: "user-a",
  name: "Alice",
  email: "alice@example.com",
  role: "superUser",
};
const bob: PresenceUser = {
  id: "user-b",
  name: "Bob",
  email: "bob@example.com",
  role: "user",
};

function beat(path: string, tabId = "tab-1", visible = true) {
  return { tabId, path, title: `Title ${path}`, visible };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-22T10:00:00Z"));
  resetPresenceRegistry();
});

afterEach(() => {
  resetPresenceRegistry();
  vi.useRealTimers();
});

describe("presence registry", () => {
  it("tracks multiple tabs per user and keeps users apart", () => {
    upsertTab(alice, beat("/a", "tab-1"));
    upsertTab(alice, beat("/b", "tab-2"));
    upsertTab(bob, beat("/c", "tab-1"));

    const tabs = getPresenceSnapshot().tabs;
    expect(tabs).toHaveLength(3);
    expect(tabs.filter((tab) => tab.userId === "user-a")).toHaveLength(2);
  });

  it("keeps connectedAt, and resets pathSince only when the path changes", () => {
    upsertTab(alice, beat("/a"));
    vi.advanceTimersByTime(5_000);
    upsertTab(alice, beat("/a"));
    let [tab] = getPresenceSnapshot().tabs;
    expect(tab.connectedAt).toBe("2026-10-22T10:00:00.000Z");
    expect(tab.pathSince).toBe("2026-10-22T10:00:00.000Z");
    expect(tab.lastSeenAt).toBe("2026-10-22T10:00:05.000Z");

    vi.advanceTimersByTime(5_000);
    upsertTab(alice, beat("/b"));
    [tab] = getPresenceSnapshot().tabs;
    expect(tab.connectedAt).toBe("2026-10-22T10:00:00.000Z");
    expect(tab.pathSince).toBe("2026-10-22T10:00:10.000Z");
  });

  it("only lets the owning user remove a tab", () => {
    upsertTab(alice, beat("/a", "shared-id"));
    removeTab(bob.id, "shared-id");
    expect(getPresenceSnapshot().tabs).toHaveLength(1);

    removeTab(alice.id, "shared-id");
    expect(getPresenceSnapshot().tabs).toHaveLength(0);
  });

  it("sweeps tabs that stopped heartbeating after the TTL", () => {
    upsertTab(alice, beat("/a", "stale"));
    vi.advanceTimersByTime(PRESENCE_TTL_MS - 10_000);
    upsertTab(alice, beat("/b", "fresh"));
    vi.advanceTimersByTime(20_000);

    sweepStaleTabs();
    expect(getPresenceSnapshot().tabs.map((tab) => tab.tabId)).toEqual([
      "fresh",
    ]);
  });

  it("runs the sweeper automatically", () => {
    upsertTab(alice, beat("/a"));
    vi.advanceTimersByTime(PRESENCE_TTL_MS + 30_000);
    expect(getPresenceSnapshot().tabs).toHaveLength(0);
  });

  it("coalesces bursts into one broadcast of the full snapshot", () => {
    const subscriber = vi.fn();
    subscribeToPresence(subscriber);

    upsertTab(alice, beat("/a", "tab-1"));
    upsertTab(alice, beat("/b", "tab-2"));
    upsertTab(bob, beat("/c", "tab-1"));
    expect(subscriber).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber.mock.calls[0][0].tabs).toHaveLength(3);
  });

  it("isolates a failing subscriber from the others", () => {
    const failing = vi.fn(() => {
      throw new Error("boom");
    });
    const healthy = vi.fn();
    subscribeToPresence(failing);
    subscribeToPresence(healthy);

    upsertTab(alice, beat("/a"));
    vi.advanceTimersByTime(300);

    expect(failing).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribeToPresence(subscriber);
    unsubscribe();

    upsertTab(alice, beat("/a"));
    vi.advanceTimersByTime(300);
    expect(subscriber).not.toHaveBeenCalled();
  });
});
