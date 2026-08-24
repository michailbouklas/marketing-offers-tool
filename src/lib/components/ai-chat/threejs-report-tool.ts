/**
 * Client-side helpers for rendering the shared generateThreeJsReport Mastra
 * tool in chat messages. The part type is "tool-generateThreeJsReport" (the
 * sharedTools map key — see src/lib/server/mastra/tools/shared.ts); the
 * output shape mirrors GenerateThreeJsReportResult in
 * src/lib/server/mastra/tools/generate-threejs-report.ts, which browser code
 * cannot import.
 */

export const THREEJS_REPORT_TOOL_PART_TYPE = "tool-generateThreeJsReport";

export type GenerateThreeJsReportOutput =
  | {
      ok: true;
      filename: string;
      openUrl: string;
      downloadUrl: string;
      chartType: string;
    }
  | { ok: false; error: string };

/** The tool result once the part reached "output-available", else null. */
export function threeJsReportOutput(
  part: unknown,
): GenerateThreeJsReportOutput | null {
  const toolPart = part as {
    state?: string;
    output?: GenerateThreeJsReportOutput;
  };
  return toolPart.state === "output-available" && toolPart.output
    ? toolPart.output
    : null;
}

/** Thrown-error text once the part reached "output-error", else null. */
export function threeJsReportErrorText(part: unknown): string | null {
  const toolPart = part as { state?: string; errorText?: string };
  return toolPart.state === "output-error"
    ? (toolPart.errorText ?? "unknown error")
    : null;
}
