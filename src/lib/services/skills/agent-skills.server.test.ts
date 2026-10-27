import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillFormData } from "./skill-editor-form";

const mocks = vi.hoisted(() => {
  const agentSkill = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return {
    agentSkill,
    findBuiltInCollision: vi.fn(),
    listBuiltInSkillNames: vi.fn(),
    userSkillsDir: vi.fn(() => "/ws/user-skills"),
    syncUserSkillFolders: vi.fn(),
    resync: vi.fn(),
  };
});

vi.mock("$lib/server/prisma", () => ({
  prisma: { agentSkill: mocks.agentSkill },
}));
vi.mock("$lib/server/mastra/skills/user-skills-fs", () => ({
  findBuiltInCollision: mocks.findBuiltInCollision,
  listBuiltInSkillNames: mocks.listBuiltInSkillNames,
  userSkillsDir: mocks.userSkillsDir,
  syncUserSkillFolders: mocks.syncUserSkillFolders,
}));
vi.mock("./user-skills-sync.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./user-skills-sync.server")>()),
  resyncUserSkills: mocks.resync,
}));

const {
  assertSkillNameAvailable,
  createAgentSkill,
  deleteAgentSkill,
  listAgentSkills,
  updateAgentSkill,
} = await import("./agent-skills.server");

const input: SkillFormData = {
  name: "my-skill",
  description: "desc",
  instructions: "body\r\n",
  userInvocable: false,
  tags: ["a", "a"],
  referenceFiles: [],
  agentIds: ["sales-agent"],
};
const owner = { userId: "u1", isSuperUser: false };
const superUser = { userId: "root", isSuperUser: true };
const row = {
  id: 1,
  name: "my-skill",
  description: "desc",
  instructions: "body",
  userInvocable: false,
  tags: ["a"],
  referenceFiles: [],
  agentIds: ["sales-agent"],
  createdByUserId: "u1",
  createdBy: { name: "User One", email: "u1@example.com" },
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("agent skills service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentSkill.findUnique.mockResolvedValue(null);
    mocks.agentSkill.findFirst.mockResolvedValue({ id: 1, name: "my-skill" });
    mocks.findBuiltInCollision.mockResolvedValue(false);
    mocks.agentSkill.create.mockResolvedValue(row);
    mocks.agentSkill.update.mockResolvedValue(row);
    mocks.resync.mockResolvedValue({ written: [], removed: [], dir: "/ws" });
  });

  it("scopes the list to the creator unless superUser", async () => {
    mocks.agentSkill.findMany.mockResolvedValue([row]);
    await listAgentSkills(owner);
    expect(mocks.agentSkill.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { createdByUserId: "u1" } }),
    );
    await listAgentSkills(superUser);
    expect(mocks.agentSkill.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it("tolerates malformed referenceFiles JSON", async () => {
    mocks.agentSkill.findMany.mockResolvedValue([
      { ...row, referenceFiles: { not: "an array" } },
      { ...row, id: 2, name: "b", referenceFiles: [{ filename: 1 }] },
      {
        ...row,
        id: 3,
        name: "c",
        referenceFiles: [{ filename: "r.md", content: "x" }],
      },
    ]);
    const rows = await listAgentSkills(superUser);
    expect(rows.map((r) => r.referenceFiles)).toEqual([
      [],
      [],
      [{ filename: "r.md", content: "x" }],
    ]);
  });

  it("rejects a duplicate DB name and a built-in collision", async () => {
    mocks.agentSkill.findUnique.mockResolvedValue({ id: 9 });
    await expect(createAgentSkill(input, owner)).rejects.toThrow(
      'A skill named "my-skill" already exists.',
    );
    mocks.agentSkill.findUnique.mockResolvedValue(null);
    mocks.findBuiltInCollision.mockResolvedValue(true);
    await expect(createAgentSkill(input, owner)).rejects.toThrow(
      '"my-skill" is a built-in skill; choose another name.',
    );
    expect(mocks.agentSkill.create).not.toHaveBeenCalled();
    expect(mocks.resync).not.toHaveBeenCalled();
  });

  it("allows the current name on edit", async () => {
    mocks.agentSkill.findUnique.mockResolvedValue({ id: 1 });
    await expect(
      assertSkillNameAvailable("my-skill", 1),
    ).resolves.toBeUndefined();
  });

  it("creates with the viewer as creator, normalised data, then resyncs", async () => {
    const result = await createAgentSkill(input, owner);
    expect(mocks.agentSkill.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "my-skill",
          instructions: "body",
          tags: ["a"],
          agentIds: ["sales-agent"],
          createdByUserId: "u1",
        }),
      }),
    );
    expect(mocks.resync).toHaveBeenCalledOnce();
    expect(result.name).toBe("my-skill");
    expect(result.createdBy?.email).toBe("u1@example.com");
  });

  it("translates a unique violation on create", async () => {
    mocks.agentSkill.create.mockRejectedValue({ code: "P2002" });
    await expect(createAgentSkill(input, owner)).rejects.toThrow(
      "A skill with that name already exists.",
    );
    expect(mocks.resync).not.toHaveBeenCalled();
  });

  it("refuses to update or delete a skill outside the viewer's scope", async () => {
    mocks.agentSkill.findFirst.mockResolvedValue(null);
    await expect(updateAgentSkill(1, input, owner)).rejects.toThrow(
      "Skill not found.",
    );
    await expect(deleteAgentSkill(1, owner)).rejects.toThrow(
      "Skill not found.",
    );
    expect(mocks.agentSkill.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, createdByUserId: "u1" } }),
    );
    expect(mocks.agentSkill.update).not.toHaveBeenCalled();
    expect(mocks.agentSkill.delete).not.toHaveBeenCalled();
  });

  it("lets a superUser update anyone's skill and re-checks the name only on rename", async () => {
    await updateAgentSkill(1, input, superUser);
    expect(mocks.agentSkill.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    );
    expect(mocks.agentSkill.findUnique).not.toHaveBeenCalled();

    await updateAgentSkill(1, { ...input, name: "renamed" }, superUser);
    expect(mocks.agentSkill.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: "renamed" } }),
    );
    expect(mocks.agentSkill.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ name: "renamed" }),
      }),
    );
    expect(mocks.resync).toHaveBeenCalledTimes(2);
  });

  it("deletes the row then resyncs", async () => {
    await deleteAgentSkill(1, owner);
    expect(mocks.agentSkill.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(mocks.resync).toHaveBeenCalledOnce();
  });
});
