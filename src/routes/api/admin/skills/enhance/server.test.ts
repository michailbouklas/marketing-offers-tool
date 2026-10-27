import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiPermission: vi.fn(),
  enhanceSkillField: vi.fn(),
}));

vi.mock("$lib/server/auth-guards", () => ({
  requireApiPermission: mocks.requireApiPermission,
}));
vi.mock("$lib/services/skills/skill-enhance.server", () => ({
  enhanceSkillField: mocks.enhanceSkillField,
}));

const { POST } = await import("./+server");

function call(body: unknown) {
  const request = new Request("http://localhost/api/admin/skills/enhance", {
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

describe("POST /api/admin/skills/enhance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.requireApiPermission.mockResolvedValue({});
    mocks.enhanceSkillField.mockResolvedValue("better text");
  });

  it("requires the skill:manage permission before reading the body", async () => {
    mocks.requireApiPermission.mockRejectedValue(
      Object.assign(new Error("Forbidden"), { status: 403 }),
    );
    expect(await status(call({ field: "description", text: "x" }))).toBe(403);
    expect(mocks.requireApiPermission).toHaveBeenCalledWith(expect.anything(), {
      skill: ["manage"],
    });
    expect(mocks.enhanceSkillField).not.toHaveBeenCalled();
  });

  it("rejects invalid bodies with 400", async () => {
    expect(await status(call("not json"))).toBe(400);
    expect(await status(call({ field: "title", text: "x" }))).toBe(400);
    expect(await status(call({ field: "description", text: "   " }))).toBe(400);
  });

  it("returns the enhanced text", async () => {
    const response = await call({
      field: "instructions",
      text: "draft",
      name: "my-skill",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "better text" });
    expect(mocks.enhanceSkillField).toHaveBeenCalledWith(
      expect.objectContaining({ field: "instructions", text: "draft" }),
    );
  });

  it("maps model failures to 502", async () => {
    mocks.enhanceSkillField.mockRejectedValue(new Error("model down"));
    expect(await status(call({ field: "description", text: "x" }))).toBe(502);
  });
});
