import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    brand: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("$lib/server/auth-guards", () => ({
  requireApiPermission: vi.fn(),
}));

const prismaModule = await import("$lib/server/prisma");
const authModule = await import("$lib/server/auth-guards");
const { GET, PUT } = await import("./+server");

const requirePermissionMock =
  authModule.requireApiPermission as unknown as ReturnType<typeof vi.fn>;
const brandMocks = (
  prismaModule.prisma as unknown as {
    brand: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  }
).brand;

function makeEvent(params: { brandId?: string }, request?: Request) {
  return { params, request } as unknown as Parameters<typeof PUT>[0];
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/admin/brands/7/pricing-targets", {
    method: "PUT",
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

beforeEach(() => {
  requirePermissionMock.mockResolvedValue({
    session: {},
    user: { id: "admin" },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/brands/[brandId]/pricing-targets", () => {
  it("returns the stored fraction as a percent", async () => {
    brandMocks.findUnique.mockResolvedValue({ id: 7, ideal_fc_perc: "0.3000" });

    const response = await GET(makeEvent({ brandId: "7" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ideal_fc_perc: 30 });
    expect(requirePermissionMock).toHaveBeenCalledWith(expect.anything(), {
      brand: ["manage"],
    });
  });

  it("returns null when no target is set", async () => {
    brandMocks.findUnique.mockResolvedValue({ id: 7, ideal_fc_perc: null });

    const response = await GET(makeEvent({ brandId: "7" }));

    expect(await response.json()).toEqual({ ideal_fc_perc: null });
  });

  it("404s for an unknown brand", async () => {
    brandMocks.findUnique.mockResolvedValue(null);

    expect(await statusOf(GET(makeEvent({ brandId: "99" })))).toBe(404);
  });

  it("400s for a malformed brand id", async () => {
    expect(await statusOf(GET(makeEvent({ brandId: "abc" })))).toBe(400);
  });
});

describe("PUT /api/admin/brands/[brandId]/pricing-targets", () => {
  it("stores the percent as a four-decimal fraction", async () => {
    brandMocks.findUnique.mockResolvedValue({ id: 7, ideal_fc_perc: null });
    brandMocks.update.mockResolvedValue({ ideal_fc_perc: "0.3250" });

    const response = await PUT(
      makeEvent({ brandId: "7" }, jsonRequest({ ideal_fc_perc: 32.5 })),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ideal_fc_perc: 32.5 });
    expect(brandMocks.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { ideal_fc_perc: "0.3250" },
      select: { ideal_fc_perc: true },
    });
  });

  it("clears the target when null is sent", async () => {
    brandMocks.findUnique.mockResolvedValue({ id: 7, ideal_fc_perc: "0.3" });
    brandMocks.update.mockResolvedValue({ ideal_fc_perc: null });

    const response = await PUT(
      makeEvent({ brandId: "7" }, jsonRequest({ ideal_fc_perc: null })),
    );

    expect(await response.json()).toEqual({ ideal_fc_perc: null });
    expect(brandMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { ideal_fc_perc: null } }),
    );
  });

  it("rejects percents outside (0, 100]", async () => {
    brandMocks.findUnique.mockResolvedValue({ id: 7, ideal_fc_perc: null });

    expect(
      await statusOf(
        PUT(makeEvent({ brandId: "7" }, jsonRequest({ ideal_fc_perc: 0 }))),
      ),
    ).toBe(400);
    expect(
      await statusOf(
        PUT(makeEvent({ brandId: "7" }, jsonRequest({ ideal_fc_perc: 101 }))),
      ),
    ).toBe(400);
    expect(brandMocks.update).not.toHaveBeenCalled();
  });

  it("404s for an unknown brand", async () => {
    brandMocks.findUnique.mockResolvedValue(null);

    expect(
      await statusOf(
        PUT(makeEvent({ brandId: "99" }, jsonRequest({ ideal_fc_perc: 30 }))),
      ),
    ).toBe(404);
  });
});
