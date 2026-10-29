import { Agent } from "@mastra/core/agent";
import { getReleaseFormatEnv } from "$lib/server/mastra/env";
import { normalizeReleaseBody } from "./release-form";

/**
 * "AI" button on the release form: a format-only pass over the markdown body.
 * The contract is structure, not content — every fact and sentence the author
 * wrote must survive, so the prompt forbids rewording and invention.
 */

export type FormatReleaseInput = {
  title?: string;
  body: string;
};

const FORMAT_SYSTEM =
  "Format the draft as a well-structured, GitHub-flavoured Markdown release note for end users of a web app. Use `##` section headings only where the content clearly supports them (for example: What's new, Improvements, Fixes), bullet lists for individual changes, bold for feature names and inline code for identifiers, paths or settings. Fix broken Markdown syntax. Keep every fact, number, name and sentence from the draft: do not add, remove, reorder across sections or reword content, and do not invent sections or items. Do not add a title line; the title is a separate field. Output only the Markdown body: no code fence wrapping the whole answer, no preamble, no closing remarks.";

export function buildFormatMessages(input: FormatReleaseInput): {
  system: string;
  user: string;
} {
  const parts: string[] = [];
  const title = input.title?.trim();
  if (title) parts.push(`Release title (for context only): ${title}`);
  parts.push(`Draft release notes:\n${input.body}`);
  return { system: FORMAT_SYSTEM, user: parts.join("\n\n") };
}

const globalForAgent = globalThis as unknown as {
  __releaseFormatterAgent?: Agent;
};

function getAgent(): Agent {
  globalForAgent.__releaseFormatterAgent ??= new Agent({
    id: "release-formatter",
    name: "Release notes formatter",
    instructions:
      "You help administrators format release notes shown to every user of the app.",
    model: getReleaseFormatEnv().RELEASE_FORMAT_MODEL,
    maxRetries: 1,
  });
  return globalForAgent.__releaseFormatterAgent;
}

/** Strip a code fence wrapping the whole answer, then LF-normalise like the store does. */
export function cleanMarkdown(text: string): string {
  let out = text.trim();
  const fenced = /^```[a-zA-Z]*\r?\n([\s\S]*?)\r?\n```$/.exec(out);
  if (fenced) out = fenced[1];
  return normalizeReleaseBody(out);
}

export async function formatReleaseBody(
  input: FormatReleaseInput,
): Promise<string> {
  const { system, user } = buildFormatMessages(input);
  const result = await getAgent().generate([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
  const out = cleanMarkdown(result.text ?? "");
  if (!out) throw new Error("The model returned an empty response.");
  return out;
}
