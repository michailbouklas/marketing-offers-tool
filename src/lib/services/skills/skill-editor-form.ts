import { z } from "zod";
import { ASSISTANT_IDS, type AssistantId } from "./assistants";

/**
 * Shared between the browser (editor validation + preview), the SvelteKit
 * actions and the Mastra folder (disk projection), so it must stay free of
 * `$lib`, `$env` and server-only imports.
 *
 * The rules mirror what Mastra enforces when it loads a SKILL.md
 * (`validateSkillMetadata` in @mastra/core): an invalid skill is logged and
 * silently dropped at load time, so we refuse to store one instead.
 */

/** Mastra skill-name rules: lowercase letters/digits/hyphens, no leading, trailing or double hyphen. */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SKILL_NAME_MAX_LENGTH = 64;
export const SKILL_DESCRIPTION_MAX_LENGTH = 1024;
export const REFERENCE_FILENAME_PATTERN = /^[a-z0-9_-]+\.md$/;
/** Mastra warns above these. */
export const SKILL_MAX_LINES = 500;
export const SKILL_MAX_TOKENS = 5000;
export const MAX_TAGS = 20;
export const TAG_MAX_LENGTH = 64;
export const MAX_REFERENCE_FILES = 20;

export type SkillReferenceFile = { filename: string; content: string };

export type SkillEditorData = {
  name: string;
  description: string;
  instructions: string;
  userInvocable: boolean;
  tags: string[];
  referenceFiles: SkillReferenceFile[];
  /** Chat agent ids the skill is projected for (at least one). */
  agentIds: AssistantId[];
};

/** CRLF / CR -> LF. */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

export function countLines(text: string): number {
  const normalized = normalizeNewlines(text);
  return normalized === "" ? 0 : normalized.split("\n").length;
}

/** Mirrors Mastra's estimate: ceil(words * 1.3). */
export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return Math.ceil(trimmed.split(/\s+/).length * 1.3);
}

const referenceFileSchema = z.object({
  filename: z
    .string()
    .trim()
    .regex(
      REFERENCE_FILENAME_PATTERN,
      "Reference file names must be lowercase-with-dashes.md",
    ),
  content: z
    .string()
    .refine(
      (value) => value.trim().length > 0,
      "Reference content is required",
    ),
});

// Kept free of .transform()/.pipe() on purpose: the sveltekit-superforms zod4
// adapter derives defaults and client constraints from the JSON schema, which
// cannot see through transforms. Normalisation happens in normalizeSkillData().
export const skillEditorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(
      SKILL_NAME_MAX_LENGTH,
      `Name must be at most ${SKILL_NAME_MAX_LENGTH} characters`,
    )
    .regex(
      SKILL_NAME_PATTERN,
      "Use lowercase letters, digits and single hyphens (e.g. store-opening-hours)",
    ),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(
      SKILL_DESCRIPTION_MAX_LENGTH,
      `Description must be at most ${SKILL_DESCRIPTION_MAX_LENGTH} characters`,
    ),
  instructions: z
    .string()
    .refine((value) => value.trim().length > 0, "Instructions are required"),
  userInvocable: z.boolean().default(true),
  tags: z
    .array(z.string().trim().min(1, "Tags cannot be empty").max(TAG_MAX_LENGTH))
    .max(MAX_TAGS, `At most ${MAX_TAGS} tags`)
    .default([]),
  referenceFiles: z
    .array(referenceFileSchema)
    .max(MAX_REFERENCE_FILES, `At most ${MAX_REFERENCE_FILES} reference files`)
    .default([])
    .refine((files) => {
      const seen = new Set<string>();
      for (const file of files) {
        const key = file.filename.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
      }
      return true;
    }, "Reference file names must be unique"),
  agentIds: z
    .array(z.enum(ASSISTANT_IDS))
    .min(1, "Select at least one assistant"),
});

export type SkillFormData = z.infer<typeof skillEditorSchema>;

export const createSkillFormSchema = skillEditorSchema;

export const editSkillFormSchema = skillEditorSchema.extend({
  id: z.number().int().positive(),
});

export const deleteSkillFormSchema = z.object({
  id: z.number().int().positive(),
});

export type CreateSkillFormData = z.infer<typeof createSkillFormSchema>;
export type EditSkillFormData = z.infer<typeof editSkillFormSchema>;
export type DeleteSkillFormData = z.infer<typeof deleteSkillFormSchema>;

/**
 * Canonical form of a validated skill: trimmed scalars, LF newlines, no
 * trailing whitespace in the body, deduplicated tags / assistants (order kept).
 */
export function normalizeSkillData(data: SkillFormData): SkillEditorData {
  return {
    name: data.name.trim(),
    description: data.description.trim(),
    instructions: normalizeNewlines(data.instructions).trimEnd(),
    userInvocable: data.userInvocable,
    tags: [...new Set(data.tags.map((tag) => tag.trim()).filter(Boolean))],
    referenceFiles: data.referenceFiles.map((file) => ({
      filename: file.filename.trim(),
      content: normalizeNewlines(file.content),
    })),
    agentIds: [...new Set(data.agentIds)],
  };
}

export type SkillActionMessage = {
  type: "success" | "error";
  text: string;
};

export function getDefaultSkillFormData(
  source?: Partial<SkillEditorData> | null,
): SkillFormData {
  return {
    name: source?.name ?? "",
    description: source?.description ?? "",
    instructions: source?.instructions ?? "",
    userInvocable: source?.userInvocable ?? true,
    tags: [...(source?.tags ?? [])],
    referenceFiles: (source?.referenceFiles ?? []).map((file) => ({
      ...file,
    })),
    agentIds: [...(source?.agentIds ?? [])],
  };
}
