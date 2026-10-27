import { normalizeNewlines, type SkillEditorData } from "./skill-editor-form";

/** A JSON string is a valid YAML double-quoted scalar. */
export function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function withSingleTrailingNewline(text: string): string {
  return normalizeNewlines(text).trimEnd() + "\n";
}

/**
 * Renders the SKILL.md Mastra loads (gray-matter frontmatter + Markdown body).
 * The assigned assistants are NOT part of the file: the folder a copy lives in
 * (`user-skills/<agentId>/<name>`) is the assignment.
 */
export function renderSkillMarkdown(skill: SkillEditorData): string {
  const lines = [
    "---",
    `name: ${skill.name}`,
    `description: ${yamlScalar(skill.description)}`,
  ];
  // Mastra defaults user-invocable to true, so only emit the non-default.
  if (skill.userInvocable === false) lines.push("user-invocable: false");
  if (skill.tags.length > 0) {
    lines.push("metadata:", `  tags: ${JSON.stringify(skill.tags)}`);
  }
  lines.push("---");
  return (
    lines.join("\n") + "\n" + withSingleTrailingNewline(skill.instructions)
  );
}

export function renderedSkillFiles(
  skill: SkillEditorData,
): Array<{ path: string; content: string }> {
  return [
    { path: "SKILL.md", content: renderSkillMarkdown(skill) },
    ...skill.referenceFiles.map((file) => ({
      path: `references/${file.filename}`,
      content: withSingleTrailingNewline(file.content),
    })),
  ];
}
