import { prisma } from "$lib/server/prisma";
import { findBuiltInCollision } from "$lib/server/mastra/skills/user-skills-fs";
import type { AssistantId } from "./assistants";
import {
  normalizeSkillData,
  type SkillEditorData,
  type SkillFormData,
  type SkillReferenceFile,
} from "./skill-editor-form";
import {
  parseReferenceFiles,
  resyncUserSkills,
} from "./user-skills-sync.server";

export { listBuiltInSkillNames } from "$lib/server/mastra/skills/user-skills-fs";

/**
 * Who is acting. Users without the superUser role only ever see, edit and
 * delete the skills they created themselves; superUsers see everything.
 */
export type SkillViewer = { userId: string; isSuperUser: boolean };

export type AgentSkillRow = {
  id: number;
  name: string;
  description: string;
  instructions: string;
  userInvocable: boolean;
  tags: string[];
  referenceFiles: SkillReferenceFile[];
  agentIds: AssistantId[];
  createdByUserId: string | null;
  createdBy: { name: string; email: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

type RawRow = Omit<AgentSkillRow, "referenceFiles" | "agentIds"> & {
  referenceFiles: unknown;
  agentIds: string[];
};

const creatorSelect = {
  createdBy: { select: { name: true, email: true } },
} as const;

function toRow(row: RawRow): AgentSkillRow {
  return {
    ...row,
    referenceFiles: parseReferenceFiles(row.referenceFiles),
    agentIds: row.agentIds as AssistantId[],
  };
}

function scopeWhere(viewer: SkillViewer) {
  return viewer.isSuperUser ? {} : { createdByUserId: viewer.userId };
}

function toWriteData(data: SkillEditorData) {
  return {
    name: data.name,
    description: data.description,
    instructions: data.instructions,
    userInvocable: data.userInvocable,
    tags: data.tags,
    // Prisma's Json input type; the editor schema already validated the shape.
    referenceFiles: data.referenceFiles,
    agentIds: data.agentIds,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function translatePrismaError(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new Error("A skill with that name already exists.");
  }
  throw error;
}

export async function listAgentSkills(
  viewer: SkillViewer,
): Promise<AgentSkillRow[]> {
  const rows = await prisma.agentSkill.findMany({
    where: scopeWhere(viewer),
    orderBy: { name: "asc" },
    include: creatorSelect,
  });
  return rows.map((row) => toRow(row));
}

/**
 * Names are global: the folder name is the skill name for every assistant, and
 * a user skill named like a built-in would silently shadow it for the assigned
 * assistants (agent-level skills win on merge), so both are refused.
 */
export async function assertSkillNameAvailable(
  name: string,
  excludeId?: number,
): Promise<void> {
  const existing = await prisma.agentSkill.findUnique({
    where: { name },
    select: { id: true },
  });
  if (existing && existing.id !== excludeId) {
    throw new Error(`A skill named "${name}" already exists.`);
  }
  if (await findBuiltInCollision(name)) {
    throw new Error(`"${name}" is a built-in skill; choose another name.`);
  }
}

async function findOwnedOrThrow(id: number, viewer: SkillViewer) {
  const current = await prisma.agentSkill.findFirst({
    where: { id, ...scopeWhere(viewer) },
    select: { id: true, name: true },
  });
  if (!current) throw new Error("Skill not found.");
  return current;
}

export async function createAgentSkill(
  input: SkillFormData,
  viewer: SkillViewer,
): Promise<AgentSkillRow> {
  const data = normalizeSkillData(input);
  await assertSkillNameAvailable(data.name);
  let row;
  try {
    row = await prisma.agentSkill.create({
      data: { ...toWriteData(data), createdByUserId: viewer.userId },
      include: creatorSelect,
    });
  } catch (error) {
    translatePrismaError(error);
  }
  await resyncUserSkills();
  return toRow(row);
}

export async function updateAgentSkill(
  id: number,
  input: SkillFormData,
  viewer: SkillViewer,
): Promise<AgentSkillRow> {
  const data = normalizeSkillData(input);
  const current = await findOwnedOrThrow(id, viewer);
  if (data.name !== current.name) await assertSkillNameAvailable(data.name, id);
  let row;
  try {
    row = await prisma.agentSkill.update({
      where: { id },
      data: toWriteData(data),
      include: creatorSelect,
    });
  } catch (error) {
    translatePrismaError(error);
  }
  await resyncUserSkills();
  return toRow(row);
}

export async function deleteAgentSkill(
  id: number,
  viewer: SkillViewer,
): Promise<void> {
  await findOwnedOrThrow(id, viewer);
  await prisma.agentSkill.delete({ where: { id } });
  await resyncUserSkills();
}
