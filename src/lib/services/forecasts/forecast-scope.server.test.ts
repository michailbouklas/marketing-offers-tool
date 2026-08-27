import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

vi.mock("$lib/server/auth-guards", () => ({
  requirePermission: vi.fn(),
  requireApiPermission: vi.fn(),
  getAuthenticatedUserRole: vi.fn(),
}));

vi.mock("$lib/server/brand-scope.server", () => ({
  listScopedBrands: vi.fn(),
}));

const guards = await import("$lib/server/auth-guards");
const scopeModule = await import("$lib/server/brand-scope.server");
const { FORECASTS_PERMISSION, loadForecastPageContext, resolveForecastBrand } =
  await import("./forecast-scope.server");

const requirePermissionMock = vi.mocked(guards.requirePermission);
const requireApiPermissionMock = vi.mocked(guards.requireApiPermission);
const getRoleMock = vi.mocked(guards.getAuthenticatedUserRole);
const listScopedBrandsMock = vi.mocked(scopeModule.listScopedBrands);

const brands = [
  { alias: "BK", name: "Burger King" },
  { alias: "kfc", name: "KFC" },
];

function makeEvent(search = ""): RequestEvent {
  return {
    url: new URL(`http://test.local/forecasts${search}`),
    locals: { session: {}, user: { id: "user-1" } },
  } as unknown as RequestEvent;
}

const catalog = [
  {
    id: "seasonal_trend",
    name: "Seasonal Trend",
    description: "",
    version: "1",
    minHistoryDays: 56,
    recommendedHorizons: [30],
    supportsHolidays: true,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  const guardResult = { session: {}, user: { id: "user-1" } };
  requirePermissionMock.mockResolvedValue(
    guardResult as unknown as Awaited<
      ReturnType<typeof guards.requirePermission>
    >,
  );
  requireApiPermissionMock.mockResolvedValue(
    guardResult as unknown as Awaited<
      ReturnType<typeof guards.requireApiPermission>
    >,
  );
  getRoleMock.mockResolvedValue("analyticsViewer");
  listScopedBrandsMock.mockResolvedValue(brands);
});

describe("resolveForecastBrand", () => {
  it("returns the scoped brands and a null brand when no alias is requested", async () => {
    const result = await resolveForecastBrand(makeEvent(), null, {
      guard: "page",
    });

    expect(result).toEqual({ userId: "user-1", brands, brand: null });
    expect(requirePermissionMock).toHaveBeenCalledWith(
      expect.anything(),
      FORECASTS_PERMISSION,
    );
    expect(requireApiPermissionMock).not.toHaveBeenCalled();
    expect(listScopedBrandsMock).toHaveBeenCalledWith({
      id: "user-1",
      role: "analyticsViewer",
    });
  });

  it("treats an empty / whitespace alias like null", async () => {
    const result = await resolveForecastBrand(makeEvent(), "   ", {
      guard: "api",
    });

    expect(result.brand).toBeNull();
  });

  it("matches aliases case-insensitively and returns the stored alias", async () => {
    const result = await resolveForecastBrand(makeEvent(), " bk ", {
      guard: "page",
    });

    expect(result.brand).toEqual({ alias: "BK", name: "Burger King" });
  });

  it("fails closed with 403 for an alias outside the scope", async () => {
    await expect(
      resolveForecastBrand(makeEvent(), "phcy", { guard: "page" }),
    ).rejects.toMatchObject({
      status: 403,
      body: { message: "This brand is not assigned to you." },
    });
  });

  it("uses the API guard in api mode", async () => {
    await resolveForecastBrand(makeEvent(), "kfc", { guard: "api" });

    expect(requireApiPermissionMock).toHaveBeenCalledWith(
      expect.anything(),
      FORECASTS_PERMISSION,
    );
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it("propagates guard rejections without touching the brand list", async () => {
    requireApiPermissionMock.mockRejectedValue(
      Object.assign(new Error("Forbidden"), { status: 403 }),
    );

    await expect(
      resolveForecastBrand(makeEvent(), "bk", { guard: "api" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(listScopedBrandsMock).not.toHaveBeenCalled();
  });

  it("never widens: an empty scope rejects every alias", async () => {
    listScopedBrandsMock.mockResolvedValue([]);

    await expect(
      resolveForecastBrand(makeEvent(), "bk", { guard: "api" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("loadForecastPageContext", () => {
  it("parses the URL filters and resolves the requested brand", async () => {
    const context = await loadForecastPageContext(
      makeEvent("?brand=KFC&horizon=90"),
      catalog,
    );

    expect(context.brand).toEqual({ alias: "kfc", name: "KFC" });
    expect(context.brands).toEqual(brands);
    expect(context.filters).toEqual({
      brand: "kfc",
      models: ["seasonal_trend"],
      horizon: 90,
    });
    expect(requirePermissionMock).toHaveBeenCalledTimes(1);
  });

  it("defaults to the first scoped brand and rewrites filters.brand to its stored alias", async () => {
    const context = await loadForecastPageContext(makeEvent(), catalog);

    expect(context.brand).toEqual({ alias: "BK", name: "Burger King" });
    expect(context.filters.brand).toBe("BK");
  });

  it("leaves the brand null when the user has no brands", async () => {
    listScopedBrandsMock.mockResolvedValue([]);

    const context = await loadForecastPageContext(makeEvent(), catalog);

    expect(context.brand).toBeNull();
    expect(context.filters.brand).toBeNull();
  });

  it("rejects a bookmarked foreign alias with 403", async () => {
    await expect(
      loadForecastPageContext(makeEvent("?brand=phcy"), catalog),
    ).rejects.toMatchObject({ status: 403 });
  });
});
