import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillEditorData } from "../../../services/skills/skill-editor-form";
import {
  agentSkillsDir,
  findBuiltInCollision,
  listBuiltInSkillNames,
  resolveInside,
  syncUserSkillFolders,
  userSkillsFor,
} from "./user-skills-fs";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "user-skills-"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

const AGENTS = ["sales-agent", "competition-agent"] as const;

const skill = (over: Partial<SkillEditorData> = {}): SkillEditorData => ({
  name: "my-skill",
  description: "Desc",
  instructions: "Body",
  userInvocable: true,
  tags: [],
  referenceFiles: [{ filename: "one.md", content: "ref one" }],
  agentIds: ["sales-agent"],
  ...over,
});

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

describe("syncUserSkillFolders", () => {
  it("projects a skill once per assigned assistant", async () => {
    const result = await syncUserSkillFolders(
      [skill({ agentIds: ["sales-agent", "competition-agent"] })],
      AGENTS,
      dir,
    );
    expect(result.written).toEqual([
      "sales-agent/my-skill",
      "competition-agent/my-skill",
    ]);
    for (const agent of AGENTS) {
      expect(
        await readFile(join(dir, agent, "my-skill", "SKILL.md"), "utf8"),
      ).toBe('---\nname: my-skill\ndescription: "Desc"\n---\nBody\n');
      expect(
        await readFile(
          join(dir, agent, "my-skill", "references", "one.md"),
          "utf8",
        ),
      ).toBe("ref one\n");
    }
  });

  it("creates every known agent folder even when empty", async () => {
    await syncUserSkillFolders([], AGENTS, dir);
    expect((await readdir(dir)).sort()).toEqual([...AGENTS].sort());
  });

  it("removes the copy of an unassigned assistant and keeps the other", async () => {
    await syncUserSkillFolders(
      [skill({ agentIds: ["sales-agent", "competition-agent"] })],
      AGENTS,
      dir,
    );
    const result = await syncUserSkillFolders(
      [skill({ agentIds: ["sales-agent"] })],
      AGENTS,
      dir,
    );
    expect(result.removed).toEqual(["competition-agent/my-skill"]);
    expect(await exists(join(dir, "competition-agent", "my-skill"))).toBe(
      false,
    );
    expect(await exists(join(dir, "sales-agent", "my-skill", "SKILL.md"))).toBe(
      true,
    );
  });

  it("deletes removed reference files on rewrite", async () => {
    await syncUserSkillFolders([skill()], AGENTS, dir);
    await syncUserSkillFolders([skill({ referenceFiles: [] })], AGENTS, dir);
    expect(
      await exists(
        join(dir, "sales-agent", "my-skill", "references", "one.md"),
      ),
    ).toBe(false);
    expect(await exists(join(dir, "sales-agent", "my-skill", "SKILL.md"))).toBe(
      true,
    );
  });

  it("removes old folders everywhere on rename", async () => {
    await syncUserSkillFolders(
      [skill({ agentIds: ["sales-agent", "competition-agent"] })],
      AGENTS,
      dir,
    );
    const result = await syncUserSkillFolders(
      [
        skill({
          name: "new-name",
          agentIds: ["sales-agent", "competition-agent"],
        }),
      ],
      AGENTS,
      dir,
    );
    expect(result.removed.sort()).toEqual([
      "competition-agent/my-skill",
      "sales-agent/my-skill",
    ]);
    expect(await exists(join(dir, "sales-agent", "new-name", "SKILL.md"))).toBe(
      true,
    );
  });

  it("prunes unknown agent folders and orphan skills, keeps non-matching names and files", async () => {
    await mkdir(join(dir, "retired-agent", "x"), { recursive: true });
    await mkdir(join(dir, "sales-agent", "zzz-old"), { recursive: true });
    await mkdir(join(dir, "sales-agent", "Keep_Me"), { recursive: true });
    await mkdir(join(dir, "Zombie_Dir"), { recursive: true });
    await writeFile(join(dir, "notes.txt"), "keep", "utf8");
    await writeFile(join(dir, "sales-agent", "stray.txt"), "keep", "utf8");

    const result = await syncUserSkillFolders([skill()], AGENTS, dir);

    expect(result.removed.sort()).toEqual([
      "retired-agent",
      "sales-agent/zzz-old",
    ]);
    expect((await readdir(dir)).sort()).toEqual(
      ["Zombie_Dir", "competition-agent", "notes.txt", "sales-agent"].sort(),
    );
    expect((await readdir(join(dir, "sales-agent"))).sort()).toEqual(
      ["Keep_Me", "my-skill", "stray.txt"].sort(),
    );
    expect(console.warn).toHaveBeenCalled();
  });

  it("skips (and warns about) an assignment to an unknown assistant", async () => {
    const result = await syncUserSkillFolders(
      [skill({ agentIds: ["ghost-agent" as never, "sales-agent"] })],
      AGENTS,
      dir,
    );
    expect(result.written).toEqual(["sales-agent/my-skill"]);
    expect(await exists(join(dir, "ghost-agent"))).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('unknown assistant "ghost-agent"'),
    );
  });
});

describe("resolveInside / agentSkillsDir / userSkillsFor", () => {
  it("rejects traversal, bad names and absolute paths", () => {
    expect(() => resolveInside(dir, "../x")).toThrow("Invalid skill name");
    expect(() => resolveInside(dir, "Bad Name")).toThrow("Invalid skill name");
    expect(() => resolveInside(dir, "a/b")).toThrow("Invalid skill name");
    expect(() => resolveInside(dir, resolve(dir, "abs"))).toThrow(
      "Invalid skill name",
    );
    expect(() => resolveInside(dir, "")).toThrow("Invalid skill name");
  });

  it("resolves valid names", () => {
    expect(resolveInside(dir, "ok-name")).toBe(resolve(dir, "ok-name"));
    expect(agentSkillsDir("sales-agent", dir)).toBe(
      resolve(dir, "sales-agent"),
    );
  });

  it("returns an absolute container path for an agent", () => {
    const paths = userSkillsFor("sales-agent")();
    expect(paths).toHaveLength(1);
    expect(paths[0].endsWith(join("user-skills", "sales-agent"))).toBe(true);
    expect(resolve(paths[0])).toBe(paths[0]);
  });
});

describe("built-in skills", () => {
  it("detects collisions only for valid names", async () => {
    await mkdir(join(dir, "alpha"), { recursive: true });
    expect(await findBuiltInCollision("alpha", dir)).toBe(true);
    expect(await findBuiltInCollision("gamma", dir)).toBe(false);
    expect(await findBuiltInCollision("Bad Name", dir)).toBe(false);
  });

  it("lists only dirs containing SKILL.md", async () => {
    await mkdir(join(dir, "b-skill"), { recursive: true });
    await writeFile(join(dir, "b-skill", "SKILL.md"), "x", "utf8");
    await mkdir(join(dir, "a-skill"), { recursive: true });
    await writeFile(join(dir, "a-skill", "SKILL.md"), "x", "utf8");
    await mkdir(join(dir, "empty"), { recursive: true });
    await writeFile(join(dir, "file.md"), "x", "utf8");
    expect(await listBuiltInSkillNames(dir)).toEqual(["a-skill", "b-skill"]);
    expect(await listBuiltInSkillNames(join(dir, "missing"))).toEqual([]);
  });
});
