import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  syncUserSkillFolders: vi.fn(),
  userSkillsDir: vi.fn(() => "/ws/user-skills"),
}));

vi.mock("$lib/server/prisma", () => ({
  prisma: { agentSkill: { findMany: mocks.findMany } },
}));
vi.mock("$lib/server/mastra/skills/user-skills-fs", () => ({
  syncUserSkillFolders: mocks.syncUserSkillFolders,
  userSkillsDir: mocks.userSkillsDir,
  findBuiltInCollision: vi.fn(),
  listBuiltInSkillNames: vi.fn(),
}));

const { resyncUserSkills, toEditorData } =
  await import("./user-skills-sync.server");
const { ASSISTANT_IDS } = await import("./assistants");

const dbRow = {
  id: 1,
  name: "a-skill",
  description: "d",
  instructions: "body",
  userInvocable: true,
  tags: ["x"],
  referenceFiles: [{ filename: "r.md", content: "c" }],
  agentIds: ["sales-agent"],
  createdByUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("resyncUserSkills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("passes mapped editor data and the known assistants to the fs sync", async () => {
    mocks.findMany.mockResolvedValue([dbRow]);
    mocks.syncUserSkillFolders.mockResolvedValue({
      written: ["sales-agent/a-skill"],
      removed: ["old"],
    });

    const result = await resyncUserSkills();

    expect(mocks.syncUserSkillFolders).toHaveBeenCalledWith(
      [toEditorData(dbRow)],
      ASSISTANT_IDS,
    );
    expect(toEditorData(dbRow)).toEqual({
      name: "a-skill",
      description: "d",
      instructions: "body",
      userInvocable: true,
      tags: ["x"],
      referenceFiles: [{ filename: "r.md", content: "c" }],
      agentIds: ["sales-agent"],
    });
    expect(result).toEqual({
      written: ["sales-agent/a-skill"],
      removed: ["old"],
      dir: "/ws/user-skills",
    });
  });

  it("logs and returns null instead of throwing", async () => {
    mocks.findMany.mockRejectedValue(new Error("db down"));
    await expect(resyncUserSkills()).resolves.toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it("serialises overlapping calls", async () => {
    const order: string[] = [];
    mocks.findMany.mockResolvedValue([]);
    mocks.syncUserSkillFolders.mockImplementation(async () => {
      order.push("start");
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push("end");
      return { written: [], removed: [] };
    });
    await Promise.all([resyncUserSkills(), resyncUserSkills()]);
    expect(order).toEqual(["start", "end", "start", "end"]);
  });
});
