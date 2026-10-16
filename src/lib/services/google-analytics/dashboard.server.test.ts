import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: {} }));

const ttlMs = { value: 6 * 3_600_000 };
vi.mock("$lib/server/env", () => ({
  getGoogleAnalyticsCacheTtlMs: vi.fn(() => ttlMs.value),
}));

vi.mock("./report-cache.server", () => ({
  readCachedReports: vi.fn(),
}));

vi.mock("./refresh-queue.server", () => ({
  enqueueGoogleAnalyticsRefresh: vi.fn(async () => undefined),
  getGoogleAnalyticsRefreshJob: vi.fn(async () => null),
}));

vi.mock("./dashboard-fetch.server", () => ({
  fetchAndCacheDashboardReports: vi.fn(),
}));

const cacheModule = await import("./report-cache.server");
const queueModule = await import("./refresh-queue.server");
const fetchModule = await import("./dashboard-fetch.server");
const { DASHBOARD_REPORT_ORDER } = await import("./dashboard-reports");
const { GoogleAnalyticsApiError } = await import("./ga4-client.server");
const {
  clearGoogleAnalyticsDashboardInFlight,
  getGoogleAnalyticsDashboard,
  getGoogleAnalyticsDashboardResult,
  getGoogleAnalyticsDashboardStatus,
} = await import("./dashboard.server");

const readCachedReports =
  cacheModule.readCachedReports as unknown as ReturnType<typeof vi.fn>;
const enqueue =
  queueModule.enqueueGoogleAnalyticsRefresh as unknown as ReturnType<
    typeof vi.fn
  >;
const getJob =
  queueModule.getGoogleAnalyticsRefreshJob as unknown as ReturnType<
    typeof vi.fn
  >;
const fetchAndCache =
  fetchModule.fetchAndCacheDashboardReports as unknown as ReturnType<
    typeof vi.fn
  >;

const property = { id: "row-a" };
const fresh = new Date(Date.now() - 60_000);
const old = new Date(Date.now() - 7 * 3_600_000);

function cached(keys: readonly string[], fetchedAt: Date) {
  return keys.map((key) => ({ key, payload: { rowCount: 1 }, fetchedAt }));
}

function fetched(keys: readonly string[], error: unknown = null) {
  return {
    fetched: new Map(keys.map((key) => [key, { rowCount: 2 }])),
    failedKeys: [],
    error,
    fetchedAt: new Date(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearGoogleAnalyticsDashboardInFlight();
  ttlMs.value = 6 * 3_600_000;
  getJob.mockResolvedValue(null);
});

describe("getGoogleAnalyticsDashboardResult", () => {
  it("serves everything from the cache when all reports are fresh", async () => {
    readCachedReports.mockResolvedValue(cached(DASHBOARD_REPORT_ORDER, fresh));

    const result = await getGoogleAnalyticsDashboardResult(property, "28d");

    expect(fetchAndCache).not.toHaveBeenCalled();
    expect(result.pendingKeys).toEqual([]);
    expect(
      Object.values(result.widgets).every((w) => w.status === "fresh"),
    ).toBe(true);
  });

  it("fetches only stale and missing reports", async () => {
    readCachedReports.mockResolvedValue([
      ...cached(["daily", "channels"], fresh),
      ...cached(["pages"], old),
    ]);
    const missing = DASHBOARD_REPORT_ORDER.filter(
      (key) => !["daily", "channels"].includes(key),
    );
    fetchAndCache.mockResolvedValue(fetched(missing));

    const result = await getGoogleAnalyticsDashboardResult(property, "7d");

    expect(fetchAndCache).toHaveBeenCalledWith("row-a", "7d", missing);
    expect(result.pendingKeys).toEqual([]);
    expect(result.widgets.pages.status).toBe("fresh");
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("on a quota error serves stale copies, marks the rest pending and queues a retry", async () => {
    readCachedReports.mockResolvedValue(cached(["daily", "pages"], old));
    const error = new GoogleAnalyticsApiError(
      429,
      "RESOURCE_EXHAUSTED",
      "quota",
    );
    const missing = DASHBOARD_REPORT_ORDER.filter((key) => key !== "daily");
    fetchAndCache.mockResolvedValue({
      fetched: new Map([["daily", { rowCount: 2 }]]),
      failedKeys: missing,
      error,
      fetchedAt: new Date(),
    });

    const result = await getGoogleAnalyticsDashboardResult(property, "28d");

    expect(result.widgets.daily.status).toBe("fresh");
    expect(result.widgets.pages).toMatchObject({ status: "stale" });
    expect(result.widgets.channels).toMatchObject({
      status: "pending",
      reason: expect.stringContaining("quota"),
    });
    expect(result.pendingKeys).toEqual(
      DASHBOARD_REPORT_ORDER.filter((key) => !["daily", "pages"].includes(key)),
    );
    expect(enqueue).toHaveBeenCalledWith({
      propertyRowId: "row-a",
      range: "28d",
      keys: missing,
      error,
    });
    // Stale `pages` still renders rows; pending keys map to empty widgets.
    expect(result.dashboard.channels).toEqual([]);
  });

  it("rethrows non-retryable failures", async () => {
    readCachedReports.mockResolvedValue([]);
    const error = new GoogleAnalyticsApiError(
      403,
      "PERMISSION_DENIED",
      "denied",
    );
    fetchAndCache.mockResolvedValue({
      fetched: new Map(),
      failedKeys: [...DASHBOARD_REPORT_ORDER],
      error,
      fetchedAt: new Date(),
    });

    await expect(
      getGoogleAnalyticsDashboardResult(property, "28d"),
    ).rejects.toBe(error);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("does not ask Google again for keys a scheduled retry already covers", async () => {
    readCachedReports.mockResolvedValue(cached(["daily"], fresh));
    const others = DASHBOARD_REPORT_ORDER.filter((key) => key !== "daily");
    getJob.mockResolvedValue({
      status: "pending",
      reportKeys: others,
      attempts: 1,
      nextRunAt: new Date(Date.now() + 5 * 60_000),
      lastError: "Google Analytics quota exhausted for this property.",
    });
    fetchAndCache.mockResolvedValue(fetched([]));

    const result = await getGoogleAnalyticsDashboardResult(property, "28d");

    expect(fetchAndCache).toHaveBeenCalledWith("row-a", "28d", []);
    expect(result.pendingKeys).toEqual(others);
    expect(result.widgets.cities).toMatchObject({
      status: "pending",
      reason: expect.stringContaining("quota"),
    });
  });

  it("shares one in-flight load per property and range", async () => {
    let resolveRead: (value: unknown[]) => void = () => undefined;
    readCachedReports.mockReturnValue(
      new Promise<unknown[]>((resolve) => {
        resolveRead = resolve;
      }),
    );

    const first = getGoogleAnalyticsDashboardResult(property, "28d");
    const second = getGoogleAnalyticsDashboardResult(property, "28d");
    const other = getGoogleAnalyticsDashboardResult(property, "7d");

    expect(second).toBe(first);
    expect(other).not.toBe(first);
    resolveRead(cached(DASHBOARD_REPORT_ORDER, fresh));
    await Promise.all([first, other]);
  });

  it("treats a zero TTL as always refetch", async () => {
    ttlMs.value = 0;
    readCachedReports.mockResolvedValue(cached(DASHBOARD_REPORT_ORDER, fresh));
    fetchAndCache.mockResolvedValue(fetched(DASHBOARD_REPORT_ORDER));

    await getGoogleAnalyticsDashboardResult(property, "28d");

    expect(fetchAndCache).toHaveBeenCalledWith("row-a", "28d", [
      ...DASHBOARD_REPORT_ORDER,
    ]);
  });
});

describe("getGoogleAnalyticsDashboard", () => {
  it("returns just the dashboard for the assistant gateway", async () => {
    readCachedReports.mockResolvedValue(cached(DASHBOARD_REPORT_ORDER, fresh));

    const dashboard = await getGoogleAnalyticsDashboard(property, "28d");

    expect(dashboard).toHaveProperty("totals");
    expect(dashboard).not.toHaveProperty("widgets");
  });
});

describe("getGoogleAnalyticsDashboardStatus", () => {
  it("lists keys with no cached copy and the job view", async () => {
    readCachedReports.mockResolvedValue(cached(["daily"], old));
    const nextRunAt = new Date("2026-10-16T12:00:00Z");
    getJob.mockResolvedValue({
      status: "pending",
      reportKeys: ["channels"],
      attempts: 2,
      nextRunAt,
      lastError: "quota",
    });

    await expect(
      getGoogleAnalyticsDashboardStatus("row-a", "28d"),
    ).resolves.toEqual({
      pendingKeys: DASHBOARD_REPORT_ORDER.filter((key) => key !== "daily"),
      job: {
        status: "pending",
        attempts: 2,
        nextRunAt: nextRunAt.toISOString(),
        lastError: "quota",
      },
    });
  });
});
