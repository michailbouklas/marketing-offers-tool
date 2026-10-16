import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: {} }));

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    brand: { findMany: vi.fn() },
  },
}));

vi.mock("$lib/server/auth-guards", () => ({
  requirePermission: vi.fn(),
  requireApiPermission: vi.fn(),
}));

const prismaModule = await import("$lib/server/prisma");
const authModule = await import("$lib/server/auth-guards");
const { resolveGoogleAnalyticsScope } = await import("./properties.server");

const requirePermissionMock =
  authModule.requirePermission as unknown as ReturnType<typeof vi.fn>;
const requireApiPermissionMock =
  authModule.requireApiPermission as unknown as ReturnType<typeof vi.fn>;
const brandFindMany = (
  prismaModule.prisma as unknown as {
    brand: { findMany: ReturnType<typeof vi.fn> };
  }
).brand.findMany;

const event = {} as unknown as Parameters<
  typeof resolveGoogleAnalyticsScope
>[0];

const brandRows = [
  {
    id: 22,
    name: "Pizza Hut",
    alias: "phcy",
    slug: "pizza-hut",
    active: true,
    google_analytics_properties: [
      { id: "row-a", propertyId: "111", displayName: "Web" },
      { id: "row-b", propertyId: "222", displayName: "App" },
    ],
  },
];

async function statusOf(result: unknown) {
  try {
    await result;
  } catch (err) {
    return (err as { status?: number }).status;
  }
  return undefined;
}

beforeEach(() => {
  requirePermissionMock.mockResolvedValue({ session: {}, user: { id: "u1" } });
  requireApiPermissionMock.mockResolvedValue({
    session: {},
    user: { id: "u1" },
  });
  brandFindMany.mockResolvedValue(brandRows);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveGoogleAnalyticsScope", () => {
  it("defaults to the first brand and its first property", async () => {
    const scope = await resolveGoogleAnalyticsScope(event, {
      brandId: null,
      propertyId: null,
      range: "28d",
    });

    expect(requirePermissionMock).toHaveBeenCalledWith(event, {
      googleAnalytics: ["view"],
    });
    expect(scope.brand?.id).toBe(22);
    expect(scope.property?.id).toBe("row-a");
    expect(scope.brands[0].properties).toHaveLength(2);
    // Only the user's own assignments are queried, for every role.
    expect(brandFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user_assignments: { some: { userId: "u1" } },
        }),
      }),
    );
  });

  it("uses the API guard when asked", async () => {
    await resolveGoogleAnalyticsScope(
      event,
      { brandId: 22, propertyId: "row-b", range: "7d" },
      { guard: "api" },
    );

    expect(requireApiPermissionMock).toHaveBeenCalledWith(event, {
      googleAnalytics: ["view"],
    });
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it("fails closed with 403 for a brand or property outside the scope", async () => {
    expect(
      await statusOf(
        resolveGoogleAnalyticsScope(event, {
          brandId: 99,
          propertyId: null,
          range: "28d",
        }),
      ),
    ).toBe(403);

    expect(
      await statusOf(
        resolveGoogleAnalyticsScope(event, {
          brandId: 22,
          propertyId: "someone-elses",
          range: "28d",
        }),
      ),
    ).toBe(403);
  });

  it("returns an empty scope when the user has no brands", async () => {
    brandFindMany.mockResolvedValue([]);

    const scope = await resolveGoogleAnalyticsScope(event, {
      brandId: null,
      propertyId: null,
      range: "90d",
    });

    expect(scope.brands).toEqual([]);
    expect(scope.brand).toBeNull();
    expect(scope.property).toBeNull();
    expect(scope.range).toBe("90d");
  });
});
