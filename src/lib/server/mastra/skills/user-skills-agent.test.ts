import { Agent } from "@mastra/core/agent";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncUserSkillFolders } from "./user-skills-fs";

/**
 * Pins the Mastra behaviour the per-assistant design relies on (verified on
 * @mastra/core 1.51.0): an agent-level `skills` entry may be a container
 * folder, its `<name>/SKILL.md` subfolders are discovered on every request,
 * a missing folder yields no skills, and an invalid SKILL.md is skipped.
 * `listSkills()` only resolves skills; no model call is made.
 */

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "user-skills-agent-"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

function agentFor(container: string) {
  return new Agent({
    id: "test-agent",
    name: "Test agent",
    instructions: "test",
    model: "openai/gpt-4o-mini",
    skills: () => [container],
  });
}

describe("agent-level skills from a per-assistant container folder", () => {
  it("sees only the skills projected into its own folder, with references", async () => {
    await syncUserSkillFolders(
      [
        {
          name: "store-hours",
          description: "Opening hours per store",
          instructions: "# Hours\n\nLook it up.",
          userInvocable: false,
          tags: ["retail"],
          referenceFiles: [{ filename: "holidays.md", content: "Christmas" }],
          agentIds: ["sales-agent"],
        },
        {
          name: "other-skill",
          description: "Not for sales",
          instructions: "Body",
          userInvocable: true,
          tags: [],
          referenceFiles: [],
          agentIds: ["competition-agent"],
        },
      ],
      ["sales-agent", "competition-agent"],
      root,
    );

    const skills = await agentFor(join(root, "sales-agent")).listSkills();
    expect(skills.map((s) => s.name)).toEqual(["store-hours"]);
    expect(skills[0]?.description).toBe("Opening hours per store");

    const other = await agentFor(join(root, "competition-agent")).listSkills();
    expect(other.map((s) => s.name)).toEqual(["other-skill"]);

    const loaded = await agentFor(join(root, "sales-agent")).getSkill(
      "store-hours",
    );
    expect(loaded?.references).toContain("holidays.md");
    expect(loaded?.["user-invocable"]).toBe(false);
  });

  it("yields no skills for a missing folder and picks up later writes", async () => {
    const container = join(root, "sales-agent");
    const agent = agentFor(container);
    expect(await agent.listSkills()).toEqual([]);

    await syncUserSkillFolders(
      [
        {
          name: "late-skill",
          description: "Added after the agent was built",
          instructions: "Body",
          userInvocable: true,
          tags: [],
          referenceFiles: [],
          agentIds: ["sales-agent"],
        },
      ],
      ["sales-agent"],
      root,
    );
    expect((await agent.listSkills()).map((s) => s.name)).toEqual([
      "late-skill",
    ]);
  });

  it("skips an invalid SKILL.md instead of failing the agent", async () => {
    const container = join(root, "sales-agent");
    await mkdir(join(container, "broken"), { recursive: true });
    await writeFile(
      join(container, "broken", "SKILL.md"),
      "---\nname: Mismatch\n---\nbody\n",
      "utf8",
    );
    await mkdir(join(container, "fine"), { recursive: true });
    await writeFile(
      join(container, "fine", "SKILL.md"),
      '---\nname: fine\ndescription: "ok"\n---\nbody\n',
      "utf8",
    );
    const skills = await agentFor(container).listSkills();
    expect(skills.map((s) => s.name)).toEqual(["fine"]);
  });
});
