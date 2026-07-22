/**
 * Client-side helpers for rendering the shared generateExcel Mastra tool in
 * chat messages. The part type is "tool-generateExcel" (the sharedTools map
 * key — see src/lib/server/mastra/tools/shared.ts); the output shape mirrors
 * GenerateExcelResult in src/lib/server/mastra/tools/generate-excel.ts,
 * which browser code cannot import.
 */

export const EXCEL_TOOL_PART_TYPE = "tool-generateExcel";

export type GenerateExcelOutput =
  | { ok: true; filename: string; downloadUrl: string }
  | { ok: false; error: string };

/** The tool result once the part reached "output-available", else null. */
export function excelOutput(part: unknown): GenerateExcelOutput | null {
  const toolPart = part as { state?: string; output?: GenerateExcelOutput };
  return toolPart.state === "output-available" && toolPart.output
    ? toolPart.output
    : null;
}

/** Thrown-error text once the part reached "output-error", else null. */
export function excelErrorText(part: unknown): string | null {
  const toolPart = part as { state?: string; errorText?: string };
  return toolPart.state === "output-error"
    ? (toolPart.errorText ?? "unknown error")
    : null;
}
