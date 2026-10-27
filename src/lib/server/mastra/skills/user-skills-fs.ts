import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
// Relative imports only: this folder is bundled by `mastra dev` (no $lib, $env or prisma).
import { workspaceDir } from "../workspace-dir";
import { renderedSkillFiles } from "../../../services/skills/skill-markdown";
import {
  SKILL_NAME_PATTERN,
  type SkillEditorData,
} from "../../../services/skills/skill-editor-form";

/**
 * `workspace/user-skills/` is the disk projection of the AgentSkill table (the
 * database is the source of truth). Layout, one copy per assigned assistant:
 *
 *   user-skills/<agentId>/<skillName>/SKILL.md
 *   user-skills/<agentId>/<skillName>/references/*.md
 *
 * Each agent points its `skills` option at its own `<agentId>` folder, which
 * Mastra scans on every request, so only the assigned assistants see a skill.
 * The folder is gitignored and exclusively owned by this module: it is rebuilt
 * at boot and after every save, and anything in it that no row claims is
 * deleted (`syncUserSkillFolders`).
 */
export const USER_SKILLS_DIRNAME = "user-skills";
export const BUILT_IN_SKILLS_DIRNAME = "skills";

export function userSkillsDir(): string {
  return join(workspaceDir(), USER_SKILLS_DIRNAME);
}

export function builtInSkillsDir(): string {
  return join(workspaceDir(), BUILT_IN_SKILLS_DIRNAME);
}

/**
 * Every rm/write goes through here so a crafted agent id or skill name can
 * never escape the skills root. Both segments must match the kebab-case
 * pattern (no dots, slashes or empty parts) and resolve inside `root`.
 */
export function resolveInside(root: string, segment: string): string {
  if (!SKILL_NAME_PATTERN.test(segment)) throw new Error("Invalid skill name");
  const resolvedRoot = resolve(root);
  const resolved = resolve(join(resolvedRoot, segment));
  const rel = relative(resolvedRoot, resolved);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Invalid skill name");
  }
  return resolved;
}

/** Absolute container folder holding one assistant's projected skills. */
export function agentSkillsDir(agentId: string, root?: string): string {
  return resolveInside(root ?? userSkillsDir(), agentId);
}

/**
 * The `skills` option for an Agent: its container folder, which Mastra scans
 * for `<name>/SKILL.md` subfolders on every request (a missing folder is
 * skipped silently). Function form so nothing touches the filesystem at
 * import time.
 */
export function userSkillsFor(agentId: string): () => string[] {
  return () => [agentSkillsDir(agentId)];
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function writeSkillFolder(
  skill: SkillEditorData,
  folder: string,
): Promise<void> {
  // rm-then-write so reference files removed in the editor disappear too.
  await rm(folder, { recursive: true, force: true });
  for (const file of renderedSkillFiles(skill)) {
    const target = join(folder, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
}

/** True when `workspace/skills/<name>` exists: a user skill would shadow it for the assigned agents. */
export async function findBuiltInCollision(
  name: string,
  dir?: string,
): Promise<boolean> {
  if (!SKILL_NAME_PATTERN.test(name)) return false;
  return isDirectory(join(dir ?? builtInSkillsDir(), name));
}

export async function listBuiltInSkillNames(dir?: string): Promise<string[]> {
  const root = dir ?? builtInSkillsDir();
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      if ((await stat(join(root, entry.name, "SKILL.md"))).isFile()) {
        names.push(entry.name);
      }
    } catch {
      // no SKILL.md: not a skill
    }
  }
  return names.sort();
}

/**
 * Full projection: writes every skill under each of its assistants, then
 * prunes. Pruning is limited to directory names matching the kebab pattern
 * (unknown agent folders at the root, unclaimed skill folders inside a known
 * agent folder); anything else is left in place with a warning.
 */
export async function syncUserSkillFolders(
  skills: SkillEditorData[],
  knownAgentIds: readonly string[],
  dir?: string,
): Promise<{ written: string[]; removed: string[] }> {
  const root = dir ?? userSkillsDir();
  await mkdir(root, { recursive: true });

  const claimed = new Map<string, Set<string>>();
  for (const agentId of knownAgentIds) {
    await mkdir(agentSkillsDir(agentId, root), { recursive: true });
    claimed.set(agentId, new Set());
  }

  const written: string[] = [];
  for (const skill of skills) {
    for (const agentId of skill.agentIds) {
      const names = claimed.get(agentId);
      if (!names) {
        console.warn(
          `[user-skills] skill "${skill.name}" is assigned to unknown assistant "${agentId}"; skipping that copy`,
        );
        continue;
      }
      await writeSkillFolder(
        skill,
        resolveInside(agentSkillsDir(agentId, root), skill.name),
      );
      names.add(skill.name);
      written.push(`${agentId}/${skill.name}`);
    }
  }

  const removed: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!SKILL_NAME_PATTERN.test(entry.name)) {
      console.warn(
        `[user-skills] leaving unexpected directory "${entry.name}" in ${root}`,
      );
      continue;
    }
    const names = claimed.get(entry.name);
    const agentDir = resolveInside(root, entry.name);
    if (!names) {
      await rm(agentDir, { recursive: true, force: true });
      removed.push(entry.name);
      continue;
    }
    for (const sub of await readdir(agentDir, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      if (!SKILL_NAME_PATTERN.test(sub.name)) {
        console.warn(
          `[user-skills] leaving unexpected directory "${sub.name}" in ${agentDir}`,
        );
        continue;
      }
      if (names.has(sub.name)) continue;
      await rm(resolveInside(agentDir, sub.name), {
        recursive: true,
        force: true,
      });
      removed.push(`${entry.name}/${sub.name}`);
    }
  }

  return { written, removed };
}
