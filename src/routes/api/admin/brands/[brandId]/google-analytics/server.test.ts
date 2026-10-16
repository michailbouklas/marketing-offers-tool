import { error } from "@sveltejs/kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: {} }));

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    brand: { findUnique: vi.fn() },
  },
}));

vi.mock("$lib/server/auth-guards", () => ({
  requireApiAdminPermission: vi.fn(),
}));

vi.mock(
  "$lib/services/google-analytics/properties.server",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("$lib/services/google-analytics/properties.server")
      >();
    return {
      ...actual,
      listPropertiesForBrandAdmin: vi.fn(),
      createProperty: vi.fn(),
    };
  },
);

const prismaModule = await import("$lib/server/prisma");
const authModule = await import("$lib/server/auth-guards");
const propertiesModule =
  await import("$lib/services/google-analytics/properties.server");
const { GET, POST } = await import("./+server");

const requireAdminMock =
  authModule.requireApiAdminPermission as unknown as ReturnType<typeof vi.fn>;
const brandFindUnique = (
  prismaModule.prisma as unknown as {
    brand: { findUnique: ReturnType<typeof vi.fn> };
  }
).brand.findUnique;
const listMock =
  propertiesModule.listPropertiesForBrandAdmin as unknown as ReturnType<
    typeof vi.fn
  >;
const createMock = propertiesModule.createProperty as unknown as ReturnType<
  typeof vi.fn
>;

function makeEvent(params: { brandId?: string }, request?: Request) {
  return { params, request } as unknown as Parameters<typeof POST>[0];
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/admin/brands/7/google-analytics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function statusOf(result: unknown) {
  try {
    await result;
  } catch (err) {
    return (err as { status?: number }).status;
  }
  return undefined;
}

const validBody = {
  propertyId: "properties/123456",
  displayName: "Website",
  credentialsJson: JSON.stringify({
    type: "service_account",
    client_email: "reader@demo.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n",
  }),
};

beforeEach(() => {
  requireAdminMock.mockResolvedValue({ session: {}, user: { id: "admin-1" } });
  brandFindUnique.mockResolvedValue({ id: 7 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/brands/[brandId]/google-analytics", () => {
  it("requires the admin + brand manage guard", async () => {
    requireAdminMock.mockImplementation(() => {
      error(403, "Forbidden");
    });

    expect(await statusOf(GET(makeEvent({ brandId: "7" })))).toBe(403);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed brand id and a missing brand", async () => {
    expect(await statusOf(GET(makeEvent({ brandId: "abc" })))).toBe(400);

    brandFindUnique.mockResolvedValue(null);
    expect(await statusOf(GET(makeEvent({ brandId: "7" })))).toBe(404);
  });

  it("lists the brand's properties without credentials", async () => {
    listMock.mockResolvedValue([
      {
        id: "row-1",
        propertyId: "123456",
        displayName: "Website",
        clientEmail: "reader@demo.iam.gserviceaccount.com",
      },
    ]);

    const response = await GET(makeEvent({ brandId: "7" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.properties).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("PRIVATE KEY");
    expect(listMock).toHaveBeenCalledWith(7);
  });
});

describe("POST /api/admin/brands/[brandId]/google-analytics", () => {
  it("rejects a non-JSON body and missing fields", async () => {
    const bad = new Request("http://localhost/x", {
      method: "POST",
      body: "nope",
    });
    expect(await statusOf(POST(makeEvent({ brandId: "7" }, bad)))).toBe(400);

    const response = await POST(
      makeEvent({ brandId: "7" }, jsonRequest({ displayName: "x" })),
    );
    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("creates the property with the acting admin as author", async () => {
    createMock.mockResolvedValue({ id: "row-1", propertyId: "123456" });

    const response = await POST(
      makeEvent({ brandId: "7" }, jsonRequest(validBody)),
    );

    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith({
      brandId: 7,
      propertyId: "properties/123456",
      displayName: "Website",
      credentialsJson: validBody.credentialsJson,
      createdBy: "admin-1",
    });
  });

  it("maps service validation and conflict errors to 400 / 409", async () => {
    createMock.mockRejectedValueOnce(
      new propertiesModule.GoogleAnalyticsPropertyValidationError("bad id"),
    );
    expect(
      await statusOf(POST(makeEvent({ brandId: "7" }, jsonRequest(validBody)))),
    ).toBe(400);

    createMock.mockRejectedValueOnce(
      new propertiesModule.GoogleAnalyticsPropertyConflictError(),
    );
    expect(
      await statusOf(POST(makeEvent({ brandId: "7" }, jsonRequest(validBody)))),
    ).toBe(409);
  });
});
