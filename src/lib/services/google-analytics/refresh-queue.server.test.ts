import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: {} }));

vi.mock("$lib/server/env", () => ({
  getGoogleAnalyticsRefreshEnv: vi.fn(() => ({
    GOOGLE_ANALYTICS_REFRESH_ENABLED: true,
    GOOGLE_ANALYTICS_REFRESH_CRON: "* * * * *",
    GOOGLE_ANALYTICS_REFRESH_MAX_AGE_HOURS: 48,
  })),
}));

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    google_analytics_refresh_job: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

const release = vi.fn(async () => undefined);
vi.mock("$lib/server/pg-advisory-lock", () => ({
  tryAcquireAdvisoryLock: vi.fn(async () => ({ release })),
}));

vi.mock("./dashboard-fetch.server", () => ({
  fetchAndCacheDashboardReports: vi.fn(),
}));

const prismaModule = await import("$lib/server/prisma");
const lockModule = await import("$lib/server/pg-advisory-lock");
const fetchModule = await import("./dashboard-fetch.server");
const { GoogleAnalyticsApiError } = await import("./ga4-client.server");
const {
  backoffMs,
  enqueueGoogleAnalyticsRefresh,
  REFRESH_FIRST_DELAY_MS,
  resetStuckGoogleAnalyticsRefreshJobs,
  tryRunGoogleAnalyticsRefreshExclusively,
} = await import("./refresh-queue.server");

const jobs = (
  prismaModule.prisma as unknown as {
    google_analytics_refresh_job: Record<string, ReturnType<typeof vi.fn>>;
  }
).google_analytics_refresh_job;
const tryAcquireAdvisoryLock =
  lockModule.tryAcquireAdvisoryLock as unknown as ReturnType<typeof vi.fn>;
const fetchAndCache =
  fetchModule.fetchAndCacheDashboardReports as unknown as ReturnType<
    typeof vi.fn
  >;

const now = new Date("2026-10-16T10:00:00Z");

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    propertyRowId: "row-a",
    range: "28d",
    reportKeys: ["channels", "cities"],
    status: "pending",
    attempts: 0,
    nextRunAt: now,
    createdAt: new Date(now.getTime() - 60_000),
    updatedAt: now,
    lastError: null,
    lastStatus: null,
    finishedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  tryAcquireAdvisoryLock.mockResolvedValue({ release });
  jobs.update.mockResolvedValue({});
});

describe("backoffMs", () => {
  it("doubles from five minutes and caps at one hour", () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(backoffMs)).toEqual([
      5 * 60_000,
      10 * 60_000,
      20 * 60_000,
      40 * 60_000,
      60 * 60_000,
      60 * 60_000,
      60 * 60_000,
    ]);
  });
});

describe("enqueueGoogleAnalyticsRefresh", () => {
  const error = new GoogleAnalyticsApiError(429, "RESOURCE_EXHAUSTED", "quota");

  it("creates a pending job that first runs after the next tick", async () => {
    jobs.findUnique.mockResolvedValue(null);

    await enqueueGoogleAnalyticsRefresh({
      propertyRowId: "row-a",
      range: "28d",
      keys: ["channels", "cities"],
      error,
      now,
    });

    expect(jobs.create).toHaveBeenCalledWith({
      data: {
        propertyRowId: "row-a",
        range: "28d",
        reportKeys: ["channels", "cities"],
        status: "pending",
        nextRunAt: new Date(now.getTime() + REFRESH_FIRST_DELAY_MS),
        lastError: "quota",
        lastStatus: 429,
      },
    });
  });

  it("merges keys into a pending job without touching its schedule or attempts", async () => {
    jobs.findUnique.mockResolvedValue({
      status: "pending",
      reportKeys: ["channels"],
    });

    await enqueueGoogleAnalyticsRefresh({
      propertyRowId: "row-a",
      range: "28d",
      keys: ["cities", "channels"],
      error,
      now,
    });

    expect(jobs.create).not.toHaveBeenCalled();
    expect(jobs.update).toHaveBeenCalledWith({
      where: { propertyRowId_range: { propertyRowId: "row-a", range: "28d" } },
      data: {
        reportKeys: ["channels", "cities"],
        lastError: "quota",
        lastStatus: 429,
      },
    });
  });

  it("reopens a finished job from attempt zero", async () => {
    jobs.findUnique.mockResolvedValue({ status: "done", reportKeys: [] });

    await enqueueGoogleAnalyticsRefresh({
      propertyRowId: "row-a",
      range: "28d",
      keys: ["daily"],
      error,
      now,
    });

    expect(jobs.update).toHaveBeenCalledWith({
      where: { propertyRowId_range: { propertyRowId: "row-a", range: "28d" } },
      data: {
        reportKeys: ["daily"],
        lastError: "quota",
        lastStatus: 429,
        status: "pending",
        attempts: 0,
        nextRunAt: new Date(now.getTime() + REFRESH_FIRST_DELAY_MS),
        finishedAt: null,
      },
    });
  });

  it("ignores an empty key list", async () => {
    await enqueueGoogleAnalyticsRefresh({
      propertyRowId: "row-a",
      range: "28d",
      keys: [],
      error,
    });

    expect(jobs.findUnique).not.toHaveBeenCalled();
  });
});

describe("resetStuckGoogleAnalyticsRefreshJobs", () => {
  it("re-queues running jobs that stopped being updated", async () => {
    jobs.updateMany.mockResolvedValue({ count: 2 });

    await expect(resetStuckGoogleAnalyticsRefreshJobs(now)).resolves.toBe(2);
    expect(jobs.updateMany).toHaveBeenCalledWith({
      where: {
        status: "running",
        updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) },
      },
      data: { status: "pending" },
    });
  });
});

describe("tryRunGoogleAnalyticsRefreshExclusively", () => {
  it("skips when another process holds the lock", async () => {
    tryAcquireAdvisoryLock.mockResolvedValue(null);

    await expect(
      tryRunGoogleAnalyticsRefreshExclusively("cron"),
    ).resolves.toMatchObject({ status: "skipped" });
    expect(jobs.findMany).not.toHaveBeenCalled();
  });

  it("marks a job done when every report lands", async () => {
    jobs.findMany.mockResolvedValue([job()]);
    fetchAndCache.mockResolvedValue({
      fetched: new Map([
        ["channels", {}],
        ["cities", {}],
      ]),
      failedKeys: [],
      error: null,
      fetchedAt: now,
    });

    const result = await tryRunGoogleAnalyticsRefreshExclusively("manual");

    expect(fetchAndCache).toHaveBeenCalledWith("row-a", "28d", [
      "channels",
      "cities",
    ]);
    expect(jobs.update).toHaveBeenNthCalledWith(1, {
      where: { id: 1 },
      data: { status: "running" },
    });
    expect(jobs.update).toHaveBeenNthCalledWith(2, {
      where: { id: 1 },
      data: expect.objectContaining({ status: "done", reportKeys: [] }),
    });
    expect(result).toMatchObject({
      status: "ran",
      summary: { processed: 1, completed: 1, stoppedOnQuota: false },
    });
    expect(release).toHaveBeenCalled();
  });

  it("reschedules with backoff on 429, keeps only the failed keys and stops the sweep", async () => {
    jobs.findMany.mockResolvedValue([
      job({ id: 1, attempts: 1 }),
      job({ id: 2, propertyRowId: "row-b" }),
    ]);
    fetchAndCache.mockResolvedValue({
      fetched: new Map([["channels", {}]]),
      failedKeys: ["cities"],
      error: new GoogleAnalyticsApiError(429, "RESOURCE_EXHAUSTED", "quota"),
      fetchedAt: now,
    });

    const result = await tryRunGoogleAnalyticsRefreshExclusively("cron");

    expect(fetchAndCache).toHaveBeenCalledTimes(1);
    const reschedule = jobs.update.mock.calls[1]![0] as {
      data: {
        status: string;
        attempts: number;
        nextRunAt: Date;
        reportKeys: string[];
      };
    };
    expect(reschedule.data.status).toBe("pending");
    expect(reschedule.data.attempts).toBe(2);
    expect(reschedule.data.reportKeys).toEqual(["cities"]);
    expect(reschedule.data.nextRunAt.getTime() - Date.now()).toBeGreaterThan(
      9 * 60_000,
    );
    expect(result).toMatchObject({
      status: "ran",
      summary: { processed: 1, rescheduled: 1, stoppedOnQuota: true },
    });
  });

  it("fails a job immediately on a non-retryable answer", async () => {
    jobs.findMany.mockResolvedValue([job()]);
    fetchAndCache.mockResolvedValue({
      fetched: new Map(),
      failedKeys: ["channels", "cities"],
      error: new GoogleAnalyticsApiError(403, "PERMISSION_DENIED", "no access"),
      fetchedAt: now,
    });

    const result = await tryRunGoogleAnalyticsRefreshExclusively("cron");

    expect(jobs.update).toHaveBeenNthCalledWith(2, {
      where: { id: 1 },
      data: expect.objectContaining({
        status: "failed",
        lastStatus: 403,
        lastError: "no access",
      }),
    });
    expect(result).toMatchObject({ summary: { failed: 1, rescheduled: 0 } });
  });

  it("gives up on a retryable failure once the job is older than the max age", async () => {
    jobs.findMany.mockResolvedValue([
      job({ createdAt: new Date(Date.now() - 49 * 3_600_000) }),
    ]);
    fetchAndCache.mockResolvedValue({
      fetched: new Map(),
      failedKeys: ["channels", "cities"],
      error: new GoogleAnalyticsApiError(503, "UNAVAILABLE", "down"),
      fetchedAt: now,
    });

    const result = await tryRunGoogleAnalyticsRefreshExclusively("cron");

    expect(jobs.update).toHaveBeenNthCalledWith(2, {
      where: { id: 1 },
      data: expect.objectContaining({ status: "failed" }),
    });
    expect(result).toMatchObject({ summary: { failed: 1 } });
  });

  it("shares one in-flight sweep per process", async () => {
    let resolveFindMany: (value: unknown[]) => void = () => undefined;
    jobs.findMany.mockReturnValue(
      new Promise<unknown[]>((resolve) => {
        resolveFindMany = resolve;
      }),
    );

    const first = tryRunGoogleAnalyticsRefreshExclusively("cron");
    const second = tryRunGoogleAnalyticsRefreshExclusively("manual");

    expect(second).toBe(first);
    resolveFindMany([]);
    await first;
    expect(tryAcquireAdvisoryLock).toHaveBeenCalledTimes(1);
  });
});
