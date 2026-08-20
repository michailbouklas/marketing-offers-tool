/**
 * Client-side helpers for rendering non-Excel Mastra tool parts in chat
 * messages. Part types are the agent tool-map keys prefixed with "tool-"
 * (see src/lib/server/mastra/tools/shared.ts). Every SQL tool's input is
 * `{ sql: string }` and Mastra's auto-injected skill tool's input is
 * `{ name: string }` — server code the browser cannot import, hence the
 * cast-based accessors (same approach as excel-tool.ts).
 */

export const SQL_TOOL_PART_TYPES = new Set([
  "tool-querySalesSql",
  "tool-queryInvoicesSql",
  "tool-queryDataQualitySql",
  "tool-queryDimOffersSql",
  "tool-queryCompetitionSql",
  "tool-queryGoogleReviewsSql",
]);

export function isSqlToolPart(type: string): boolean {
  return SQL_TOOL_PART_TYPES.has(type);
}

/**
 * The SQL the model wrote, once present on the part's input, else null.
 * Null also covers "input-streaming" (partial input) and history rows stored
 * without inputs, where the label must stay a plain non-expandable line.
 */
export function toolSql(part: unknown): string | null {
  const input = (part as { input?: { sql?: unknown } }).input;
  return typeof input?.sql === "string" && input.sql.trim().length > 0
    ? input.sql
    : null;
}

/**
 * Failure text: a thrown tool error ("output-error"), or an `ok: false`
 * result the SQL tools return instead of throwing. Null while pending or on
 * success.
 */
export function toolErrorText(part: unknown): string | null {
  const toolPart = part as {
    state?: string;
    errorText?: string;
    output?: { ok?: boolean; error?: string };
  };

  if (toolPart.state === "output-error") {
    return toolPart.errorText ?? "unknown error";
  }

  if (toolPart.state === "output-available" && toolPart.output?.ok === false) {
    return toolPart.output.error ?? "unknown error";
  }

  return null;
}

/** True while the model is still streaming the tool call's input. */
export function toolPending(part: unknown): boolean {
  return (part as { state?: string }).state === "input-streaming";
}

/** Human label for any non-Excel tool part. */
export function toolLabel(type: string, part: unknown): string {
  if (isSqlToolPart(type)) {
    return "Queried the database";
  }

  if (type === "tool-skill") {
    const name = (part as { input?: { name?: unknown } }).input?.name;
    return typeof name === "string" && name.length > 0
      ? `Used ${name}`
      : "Using a skill…";
  }

  if (type === "tool-skill_search") {
    return "Searched available skills";
  }

  if (type === "tool-skill_read") {
    return "Read skill instructions";
  }

  if (type.startsWith("tool-mastra_workspace_")) {
    return "Inspected the workspace";
  }

  if (type === "dynamic-tool") {
    const toolName = (part as { toolName?: unknown }).toolName;
    return typeof toolName === "string" && toolName.length > 0
      ? `Used ${toolName}`
      : "Used a tool";
  }

  return "Used a tool";
}
