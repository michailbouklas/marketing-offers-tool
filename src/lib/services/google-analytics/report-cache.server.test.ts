import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: {} }));

vi.mock("$lib/server/prisma", () => {
  const cache = {
    findMany: vi.fn(),
    upsert: vi.fn((args: unknown) => ({ upsert: args })),
    deleteMany: vi.fn(),
  };

  return {
    prisma: {
      google_analytics_report_cache: cache,
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    },
  };
});

const prismaModule = await import("$lib/server/prisma");
const {
  clearGoogleAnalyticsReportCache,
  readCachedReports,
  writeCachedReports,
} = await import("./report-cache.server");

const prismaMock = prismaModule.prisma as unknown as {
  google_analytics_report_cache: {
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readCachedReports", () => {
  it("maps rows to typed reports and drops keys the dashboard no longer uses", async () => {
    const fetchedAt = new Date("2026-10-16T08:00:00Z");
    prismaMock.google_analytics_report_cache.findMany.mockResolvedValue([
      { reportKey: "daily", payload: { rowCount: 3 }, fetchedAt },
      { reportKey: "retiredWidget", payload: {}, fetchedAt },
    ]);

    const reports = await readCachedReports("row-a", "28d");

    expect(
      prismaMock.google_analytics_report_cache.findMany,
    ).toHaveBeenCalledWith({
      where: { propertyRowId: "row-a", range: "28d" },
      select: { reportKey: true, payload: true, fetchedAt: true },
    });
    expect(reports).toEqual([
      { key: "daily", payload: { rowCount: 3 }, fetchedAt },
    ]);
  });
});

describe("writeCachedReports", () => {
  it("upserts every entry in one transaction with a shared fetchedAt and no quota metadata", async () => {
    const fetchedAt = new Date("2026-10-16T09:00:00Z");

    await writeCachedReports(
      "row-a",
      "7d",
      [
        {
          key: "channels",
          payload: {
            rowCount: 1,
            propertyQuota: { tokensPerDay: { remaining: 5 } },
          },
        },
        { key: "cities", payload: { rowCount: 2 } },
      ],
      fetchedAt,
    );

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(
      prismaMock.google_analytics_report_cache.upsert,
    ).toHaveBeenCalledTimes(2);
    expect(
      prismaMock.google_analytics_report_cache.upsert,
    ).toHaveBeenNthCalledWith(1, {
      where: {
        propertyRowId_range_reportKey: {
          propertyRowId: "row-a",
          range: "7d",
          reportKey: "channels",
        },
      },
      create: {
        propertyRowId: "row-a",
        range: "7d",
        reportKey: "channels",
        payload: { rowCount: 1 },
        fetchedAt,
      },
      update: { payload: { rowCount: 1 }, fetchedAt },
    });
  });

  it("does nothing for an empty list", async () => {
    await writeCachedReports("row-a", "7d", []);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("clearGoogleAnalyticsReportCache", () => {
  it("scopes to one property when given and returns the row count", async () => {
    prismaMock.google_analytics_report_cache.deleteMany.mockResolvedValue({
      count: 11,
    });

    await expect(clearGoogleAnalyticsReportCache("row-a")).resolves.toBe(11);
    expect(
      prismaMock.google_analytics_report_cache.deleteMany,
    ).toHaveBeenCalledWith({ where: { propertyRowId: "row-a" } });
  });

  it("clears everything without a property", async () => {
    prismaMock.google_analytics_report_cache.deleteMany.mockResolvedValue({
      count: 40,
    });

    await expect(clearGoogleAnalyticsReportCache()).resolves.toBe(40);
    expect(
      prismaMock.google_analytics_report_cache.deleteMany,
    ).toHaveBeenCalledWith({ where: {} });
  });
});
