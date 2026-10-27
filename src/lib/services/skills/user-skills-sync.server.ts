import { prisma } from "$lib/server/prisma";
import {
  syncUserSkillFolders,
  userSkillsDir,
} from "$lib/server/mastra/skills/user-skills-fs";
import { ASSISTANT_IDS, type AssistantId } from "./assistants";
import type { SkillEditorData, SkillReferenceFile } from "./skill-editor-form";

/**
 * Projects the AgentSkill table onto `workspace/user-skills/` (the database
 * is the source of truth). Runs at boot (hooks.server.ts `init`) and after
 * every create / update / delete. Calls are serialised so two concurrent
 * saves cannot interleave their rm/write passes, and failures are logged
 * rather than thrown: a broken projection must not fail an admin's save or
 * stop the server (built-in skills still load).
 */

export type UserSkillsSyncResult = {
  written: string[];
  removed: string[];
  dir: string;
};

export type RawAgentSkillRow = {
  name: string;
  description: string;
  instructions: string;
  userInvocable: boolean;
  tags: string[];
  referenceFiles: unknown;
  agentIds: string[];
};

/** Validates the untyped JSON column; a malformed row projects no reference files. */
export function parseReferenceFiles(value: unknown): SkillReferenceFile[] {
  if (!Array.isArray(value)) return [];
  const files: SkillReferenceFile[] = [];
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as SkillReferenceFile).filename !== "string" ||
      typeof (item as SkillReferenceFile).content !== "string"
    ) {
      return [];
    }
    files.push({
      filename: (item as SkillReferenceFile).filename,
      content: (item as SkillReferenceFile).content,
    });
  }
  return files;
}

export function toEditorData(row: RawAgentSkillRow): SkillEditorData {
  return {
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    userInvocable: row.userInvocable,
    tags: row.tags,
    referenceFiles: parseReferenceFiles(row.referenceFiles),
    agentIds: row.agentIds as AssistantId[],
  };
}

async function performSync(): Promise<UserSkillsSyncResult | null> {
  try {
    const rows = await prisma.agentSkill.findMany();
    const skills = rows.map((row) => toEditorData(row));
    const { written, removed } = await syncUserSkillFolders(
      skills,
      ASSISTANT_IDS,
    );
    const dir = userSkillsDir();
    console.info(
      `[skills] synced ${skills.length} user skill(s) into ${written.length} assistant folder(s) under ${dir} (removed ${removed.length} orphan folder(s))`,
    );
    return { written, removed, dir };
  } catch (error) {
    console.error(
      "[skills] user-skill sync failed; built-in skills still load",
      error,
    );
    return null;
  }
}

const globalForSync = globalThis as typeof globalThis & {
  userSkillsSyncChain?: Promise<unknown>;
};

/**
 * Re-projects every skill. Resolves to the sync summary, or `null` when the
 * projection failed (already logged). Never rejects.
 */
export function resyncUserSkills(): Promise<UserSkillsSyncResult | null> {
  const previous = globalForSync.userSkillsSyncChain ?? Promise.resolve();
  const run = previous.then(performSync, performSync);
  globalForSync.userSkillsSyncChain = run;
  return run;
}
