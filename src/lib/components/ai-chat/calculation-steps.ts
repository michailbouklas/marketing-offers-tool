/**
 * "How this was calculated": turns an assistant message's tool parts into a
 * list of steps (tool, inputs, rows returned, cut-at-limit warning, SQL).
 * Pure and shape-based, so it works the same for streamed messages and for
 * ones reloaded from history.
 */

import { CHART_TOOL_PART_TYPE } from "./chart-tool";
import { EXCEL_TOOL_PART_TYPE } from "./excel-tool";
import { THREEJS_REPORT_TOOL_PART_TYPE } from "./threejs-report-tool";
import { isSqlToolPart, toolSql } from "./tool-part";

export type CalculationStep = {
  key: string;
  /** Tool name in plain words. */
  label: string;
  /** Main inputs, one line each. Empty for unknown tools (see rawInput). */
  inputs: { label: string; value: string }[];
  /** Unknown tools only: the input as JSON. */
  rawInput: string | null;
  sql: string | null;
  /** What came back, e.g. [{ label: "rows", count: 200 }]. */
  returned: { label: string; count: number }[];
  /** The tool said its result was cut at a row limit. */
  truncated: boolean;
  failed: boolean;
};

const SQL_LABELS: Record<string, string> = {
  "tool-querySalesSql": "Sales database query",
  "tool-queryInvoicesSql": "Invoices database query",
  "tool-queryDataQualitySql": "Offers data quality database query",
  "tool-queryDimOffersSql": "Offers catalogue database query",
  "tool-queryCompetitionSql": "Competition database query",
  "tool-queryGoogleReviewsSql": "Google reviews database query",
  "tool-queryManagementAccountsSql": "Management accounts database query",
};

/** Output tools and Mastra's own helpers produce no numbers. */
function isDataToolPart(type: string): boolean {
  if (type === "dynamic-tool") return true;
  return (
    type.startsWith("tool-") &&
    type !== EXCEL_TOOL_PART_TYPE &&
    type !== THREEJS_REPORT_TOOL_PART_TYPE &&
    type !== CHART_TOOL_PART_TYPE &&
    !type.startsWith("tool-skill") &&
    !type.startsWith("tool-mastra_workspace_")
  );
}

/** "getItemAnalysis" / "sales_channels" -> "Get item analysis" / "Sales channels". */
function plainWords(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isScalar = (value: unknown) =>
  ["string", "number", "boolean"].includes(typeof value);

function inputValue(value: unknown): string {
  if (isScalar(value)) return String(value);
  if (Array.isArray(value) && value.every(isScalar)) return value.join(", ");
  return JSON.stringify(value);
}

function describeInputs(input: Record<string, unknown>) {
  const lines: { label: string; value: string }[] = [];
  const { from, to } = input;
  const range = typeof from === "string" && typeof to === "string";
  if (range) {
    lines.push({ label: "Date range", value: `${from} to ${to}` });
  }
  for (const [key, value] of Object.entries(input)) {
    const empty =
      value === null ||
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);
    // sql has its own block; from/to were merged above.
    if (empty || key === "sql" || (range && (key === "from" || key === "to")))
      continue;
    lines.push({ label: plainWords(key), value: inputValue(value) });
  }
  return lines;
}

function describeReturned(output: Record<string, unknown>) {
  if (typeof output.returnedRows === "number") {
    return [{ label: "rows", count: output.returnedRows }];
  }
  if (Array.isArray(output.rows)) {
    return [{ label: "rows", count: output.rows.length }];
  }
  if (typeof output.rowCount === "number") {
    return [{ label: "rows", count: output.rowCount }];
  }
  // Typed tools return named lists, some one level down ({ rows, truncated }).
  return Object.entries(output).flatMap(([key, value]) => {
    const list = isRecord(value) ? value.rows : value;
    return Array.isArray(list)
      ? [{ label: plainWords(key).toLowerCase(), count: list.length }]
      : [];
  });
}

/** Any `truncated` / `…Truncated` flag set by the tool, lists excluded. */
function hasTruncatedFlag(value: unknown, depth = 0): boolean {
  if (!isRecord(value) || depth > 3) return false;
  return Object.entries(value).some(([key, child]) =>
    /truncated$/i.test(key)
      ? child === true
      : hasTruncatedFlag(child, depth + 1),
  );
}

export function calculationSteps(parts: readonly unknown[]): CalculationStep[] {
  return parts.flatMap((raw, index) => {
    const part = raw as {
      type?: string;
      state?: string;
      toolName?: unknown;
      toolCallId?: unknown;
      input?: unknown;
      output?: unknown;
    };
    const type = part.type ?? "";
    const finished =
      part.state === "output-available" || part.state === "output-error";
    if (!isDataToolPart(type) || !finished) return [];

    const output = isRecord(part.output) ? part.output : {};
    // dynamic-tool = not in the agent's typed tool map, so nothing is known about its input.
    const known = type !== "dynamic-tool" && isRecord(part.input);
    const name =
      type === "dynamic-tool"
        ? typeof part.toolName === "string"
          ? part.toolName
          : "tool"
        : type.slice("tool-".length);

    return [
      {
        key: typeof part.toolCallId === "string" ? part.toolCallId : `${index}`,
        label: SQL_LABELS[type] ?? plainWords(name),
        inputs: known
          ? describeInputs(part.input as Record<string, unknown>)
          : [],
        rawInput:
          known || part.input === undefined
            ? null
            : JSON.stringify(part.input, null, 2),
        sql: isSqlToolPart(type) ? toolSql(part) : null,
        returned: describeReturned(output),
        truncated: hasTruncatedFlag(output),
        failed: part.state === "output-error" || output.ok === false,
      },
    ];
  });
}
