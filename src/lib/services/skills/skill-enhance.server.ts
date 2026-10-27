import { Agent } from "@mastra/core/agent";
import { getSkillEnhanceEnv } from "$lib/server/mastra/env";

export type EnhanceField = "description" | "instructions";
export type EnhanceSkillInput = {
  field: EnhanceField;
  text: string;
  name?: string;
  description?: string;
  instructions?: string;
};

const DESCRIPTION_MAX = 1024;
const CONTEXT_EXCERPT = 1500;

const DESCRIPTION_SYSTEM =
  "Rewrite the draft into the `description` line of an Agent Skill's SKILL.md frontmatter. AI assistants read only this line to decide whether to load the skill, so state what the skill does and when to use it, in one or two plain sentences. Keep every concrete fact from the draft; do not invent capabilities, tools or data. Maximum 1024 characters, aim for under 300. Output only the description text: no quotes, no Markdown, no preamble.";

const INSTRUCTIONS_SYSTEM =
  "Improve the Markdown body of an Agent Skill so an AI assistant can follow it reliably: a one-line purpose, when to use it, numbered steps, explicit inputs and outputs, and edge cases or pitfalls. Keep every fact, name, number, SQL, path and rule from the draft; do not invent tools, tables, columns or data. Use concise wording and keep the result under 500 lines. Output only the Markdown body: no YAML frontmatter, no code fence wrapping the whole answer, no preamble.";

export function buildEnhanceMessages(input: EnhanceSkillInput): {
  system: string;
  user: string;
} {
  const parts: string[] = [];
  const name = input.name?.trim();
  if (name) parts.push(`Skill name: ${name}`);

  if (input.field === "description") {
    const instructions = input.instructions?.trim();
    if (instructions) {
      parts.push(
        `Instructions the skill currently has (for context only):\n${instructions.slice(0, CONTEXT_EXCERPT)}`,
      );
    }
    parts.push(`Draft description:\n${input.text}`);
    return { system: DESCRIPTION_SYSTEM, user: parts.join("\n\n") };
  }

  const description = input.description?.trim();
  if (description) {
    parts.push(`Skill description (for context only):\n${description}`);
  }
  parts.push(`Draft instructions:\n${input.text}`);
  return { system: INSTRUCTIONS_SYSTEM, user: parts.join("\n\n") };
}

const globalForAgent = globalThis as unknown as {
  __skillEnhancerAgent?: Agent;
};

function getAgent(): Agent {
  globalForAgent.__skillEnhancerAgent ??= new Agent({
    id: "skill-enhancer",
    name: "Skill enhancer",
    instructions:
      "You help administrators write Agent Skills (SKILL.md) for AI assistants.",
    model: getSkillEnhanceEnv().SKILL_ENHANCE_MODEL,
    maxRetries: 1,
  });
  return globalForAgent.__skillEnhancerAgent;
}

function cleanDescription(text: string): string {
  let out = text.replace(/\s+/g, " ").trim();
  const quoted = /^(["'`“])(.*)(["'`”])$/.exec(out);
  if (quoted) out = quoted[2].trim();
  return out.slice(0, DESCRIPTION_MAX);
}

function cleanInstructions(text: string): string {
  let out = text.trim();
  const fenced = /^```[a-zA-Z]*\r?\n([\s\S]*?)\r?\n```$/.exec(out);
  if (fenced) out = fenced[1].trim();
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(out);
  if (frontmatter) out = out.slice(frontmatter[0].length).trim();
  return out;
}

export async function enhanceSkillField(
  input: EnhanceSkillInput,
): Promise<string> {
  const { system, user } = buildEnhanceMessages(input);
  const result = await getAgent().generate([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
  const raw = (result.text ?? "").trim();
  const out =
    input.field === "description"
      ? cleanDescription(raw)
      : cleanInstructions(raw);
  if (!out) throw new Error("The model returned an empty response.");
  return out;
}
