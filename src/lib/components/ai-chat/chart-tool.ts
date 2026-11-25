/**
 * Client-side helpers for rendering the shared generateChart Mastra tool in
 * chat messages. The part type is "tool-generateChart" (the sharedTools map
 * key — see src/lib/server/mastra/tools/shared.ts); the output shape mirrors
 * GenerateChartResult in src/lib/server/mastra/tools/generate-chart.ts, which
 * browser code cannot import.
 */

export const CHART_TOOL_PART_TYPE = "tool-generateChart";

export type ChartSpec = {
  ok: true;
  chartType: "bar" | "line" | "pie";
  title: string;
  xLabel: string;
  series: { key: string; label: string }[];
  rows: ({ x: string } & Record<string, number | string>)[];
};

export type GenerateChartOutput = ChartSpec | { ok: false; error: string };

/** The tool result once the part reached "output-available", else null. */
export function chartOutput(part: unknown): GenerateChartOutput | null {
  const toolPart = part as { state?: string; output?: GenerateChartOutput };
  return toolPart.state === "output-available" && toolPart.output
    ? toolPart.output
    : null;
}

/** Thrown-error text once the part reached "output-error", else null. */
export function chartErrorText(part: unknown): string | null {
  const toolPart = part as { state?: string; errorText?: string };
  return toolPart.state === "output-error"
    ? (toolPart.errorText ?? "unknown error")
    : null;
}
