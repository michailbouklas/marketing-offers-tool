import { error } from "@sveltejs/kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: {} }));

vi.mock("$lib/services/google-analytics/properties.server", () => ({
  resolveGoogleAnalyticsScope: vi.fn(),
}));

vi.mock("$lib/services/google-analytics/realtime.server", () => ({
  getGoogleAnalyticsRealtime: vi.fn(),
}));

const propertiesModule =
  await import("$lib/services/google-analytics/properties.server");
const realtimeModule =
  await import("$lib/services/google-analytics/realtime.server");
const { GoogleAnalyticsApiError } =
  await import("$lib/services/google-analytics/ga4-client.server");
const { GET } = await import("./+server");

const resolveScopeMock =
  propertiesModule.resolveGoogleAnalyticsScope as unknown as ReturnType<
    typeof vi.fn
  >;
const realtimeMock =
  realtimeModule.getGoogleAnalyticsRealtime as unknown as ReturnType<
    typeof vi.fn
  >;

function makeEvent(search = "?brand=22&property=row-1") {
  return {
    url: new URL(`http://localhost/api/google-analytics/realtime${search}`),
  } as unknown as Parameters<typeof GET>[0];
}

async function statusOf(result: unknown) {
  try {
    await result;
  } catch (err) {
    return (err as { status?: number }).status;
  }
  return undefined;
}

const property = { id: "row-1", propertyId: "123", displayName: "Web" };

beforeEach(() => {
  resolveScopeMock.mockResolvedValue({
    userId: "u1",
    brands: [],
    brand: { id: 22 },
    property,
    range: "28d",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/google-analytics/realtime", () => {
  it("resolves scope with the API guard and propagates 403", async () => {
    resolveScopeMock.mockImplementation(() => {
      error(403, "This brand is not assigned to you.");
    });

    expect(await statusOf(GET(makeEvent()))).toBe(403);
    expect(resolveScopeMock).toHaveBeenCalledWith(
      expect.anything(),
      { brandId: 22, propertyId: "row-1", range: "28d" },
      { guard: "api" },
    );
    expect(realtimeMock).not.toHaveBeenCalled();
  });

  it("answers 404 when the user has no property in scope", async () => {
    resolveScopeMock.mockResolvedValue({
      userId: "u1",
      brands: [],
      brand: null,
      property: null,
      range: "28d",
    });

    expect(await statusOf(GET(makeEvent("")))).toBe(404);
  });

  it("returns the snapshot with no-store caching", async () => {
    const snapshot = {
      activeUsers: 7,
      perMinute: [],
      topPages: [],
      fetchedAt: "2026-10-16T10:00:00.000Z",
    };
    realtimeMock.mockResolvedValue(snapshot);

    const response = await GET(makeEvent());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(snapshot);
    expect(realtimeMock).toHaveBeenCalledWith(property);
  });

  it("turns a Google failure into a 502 with a readable message", async () => {
    realtimeMock.mockRejectedValue(
      new GoogleAnalyticsApiError(429, "RESOURCE_EXHAUSTED", "quota"),
    );

    const response = await GET(makeEvent());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toContain("quota");
  });
});
