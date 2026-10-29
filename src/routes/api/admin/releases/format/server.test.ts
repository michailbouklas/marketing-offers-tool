import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiAdminPermission: vi.fn(),
  formatReleaseBody: vi.fn(),
}));

vi.mock("$lib/server/auth-guards", () => ({
  requireApiAdminPermission: mocks.requireApiAdminPermission,
}));
vi.mock("$lib/services/releases/release-format.server", () => ({
  formatReleaseBody: mocks.formatReleaseBody,
}));

const { POST } = await import("./+server");

function call(body: unknown) {
  const request = new Request("http://localhost/api/admin/releases/format", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return POST({ request } as never);
}

async function status(result: Response | Promise<Response>): Promise<number> {
  try {
    return (await result).status;
  } catch (thrown) {
    return (thrown as { status: number }).status;
  }
}

describe("POST /api/admin/releases/format", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.requireApiAdminPermission.mockResolvedValue({});
    mocks.formatReleaseBody.mockResolvedValue("## Better");
  });

  it("requires release:manage before reading the body", async () => {
    mocks.requireApiAdminPermission.mockRejectedValue(
      Object.assign(new Error("Forbidden"), { status: 403 }),
    );
    expect(await status(call({ body: "x" }))).toBe(403);
    expect(mocks.requireApiAdminPermission).toHaveBeenCalledWith(
      expect.anything(),
      { release: ["manage"] },
    );
    expect(mocks.formatReleaseBody).not.toHaveBeenCalled();
  });

  it("rejects invalid bodies with 400", async () => {
    expect(await status(call("not json"))).toBe(400);
    expect(await status(call({ title: "t" }))).toBe(400);
    expect(await status(call({ body: "   " }))).toBe(400);
  });

  it("returns the formatted text", async () => {
    const response = await call({ title: "Forecasts", body: "draft" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "## Better" });
    expect(mocks.formatReleaseBody).toHaveBeenCalledWith({
      title: "Forecasts",
      body: "draft",
    });
  });

  it("maps model failures to 502", async () => {
    mocks.formatReleaseBody.mockRejectedValue(new Error("model down"));
    expect(await status(call({ body: "x" }))).toBe(502);
  });
});
