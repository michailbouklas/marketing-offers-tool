/**
 * Minimal frontmatter serializer/parser for the inspiration gallery markdown
 * files. We control every write, so the format is deliberately simple: a
 * leading `---` fence, one single-line `key: value` per field, a closing
 * `---` fence, then the body (the prompt). No YAML library needed.
 */

export interface ParsedFrontmatter {
  fields: Record<string, string>;
  body: string;
}

/** Collapse newlines so a field value can never break the line-based format. */
function sanitizeValue(value: string): string {
  return value.replaceAll(/\r?\n/g, " ").trim();
}

export function serializeFrontmatter(
  fields: Record<string, string>,
  body: string,
): string {
  const lines = Object.entries(fields).map(
    ([key, value]) => `${key}: ${sanitizeValue(value)}`,
  );
  return `---\n${lines.join("\n")}\n---\n${body.trim()}\n`;
}

/**
 * Tolerant parser: text without a valid frontmatter block parses as
 * `{ fields: {}, body: text }` so a hand-edited or corrupted file still
 * surfaces its content instead of throwing.
 */
export function parseFrontmatter(text: string): ParsedFrontmatter {
  const normalized = text.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) {
    return { fields: {}, body: normalized.trim() };
  }
  const closing = normalized.indexOf("\n---", 4);
  if (closing === -1) {
    return { fields: {}, body: normalized.trim() };
  }

  const fields: Record<string, string> = {};
  for (const line of normalized.slice(4, closing).split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) {
      fields[key] = value;
    }
  }

  const bodyStart = normalized.indexOf("\n", closing + 1);
  const body = bodyStart === -1 ? "" : normalized.slice(bodyStart + 1).trim();
  return { fields, body };
}
