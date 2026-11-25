import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const MAX_ROWS = 200;
const MAX_SERIES = 6;
const MAX_PIE_SLICES = 12;

export type ChartType = "bar" | "line" | "pie";

/**
 * What the chat UI draws (src/lib/components/ai-chat/chart-part.svelte).
 * Series keys are positional (s0, s1, …) because the model's column names are
 * free text and the chart needs CSS-safe keys.
 */
export type GenerateChartResult =
  | {
      ok: true;
      chartType: ChartType;
      title: string;
      xLabel: string;
      series: { key: string; label: string }[];
      rows: ({ x: string } & Record<string, number | string>)[];
    }
  | { ok: false; error: string };

const inputSchema = z.object({
  chartType: z
    .enum(["bar", "line", "pie"])
    .describe(
      "bar: compare categories. line: trend over ordered x values (dates, weeks). " +
        "pie: share of a whole (exactly ONE series, positive values).",
    ),
  title: z.string().min(1).max(120).describe("Chart headline."),
  xKey: z
    .string()
    .min(1)
    .max(60)
    .describe("Row key holding the category / x value (pie: slice name)."),
  series: z
    .array(
      z.object({
        key: z.string().min(1).max(60).describe("Row key of a numeric column."),
        label: z.string().min(1).max(60).describe("Legend label."),
      }),
    )
    .min(1)
    .max(MAX_SERIES)
    .describe(`Numeric columns to plot (1–${MAX_SERIES}).`),
  rows: z
    .array(z.record(z.string(), z.union([z.string(), z.number(), z.null()])))
    .min(1)
    .max(MAX_ROWS)
    .describe(
      `Data rows as objects, in display order (max ${MAX_ROWS}); each needs xKey and every series key.`,
    ),
});

export type GenerateChartInput = z.infer<typeof inputSchema>;

/** Validates the model's input and returns the spec the chat UI renders. */
export function buildChartSpec(input: GenerateChartInput): GenerateChartResult {
  const { chartType, xKey, series } = input;

  if (chartType === "pie") {
    if (series.length !== 1) {
      return {
        ok: false,
        error:
          "chartType pie needs exactly one series (the slice values). Use bar to compare several series.",
      };
    }
    if (input.rows.length > MAX_PIE_SLICES) {
      return {
        ok: false,
        error: `pie supports at most ${MAX_PIE_SLICES} slices — group the smallest into an "Other" row first, or use bar.`,
      };
    }
  }

  const rows: ({ x: string } & Record<string, number | string>)[] = [];
  for (const [index, row] of input.rows.entries()) {
    const x = row[xKey];
    if (x === null || x === undefined || String(x).trim() === "") {
      return {
        ok: false,
        error: `Row ${index + 1} has no value for xKey "${xKey}".`,
      };
    }
    const out: { x: string } & Record<string, number | string> = {
      x: String(x),
    };
    for (const [seriesIndex, item] of series.entries()) {
      const raw = row[item.key];
      const value = typeof raw === "string" ? Number(raw) : raw;
      if (typeof value !== "number" || !Number.isFinite(value) || raw === "") {
        return {
          ok: false,
          error: `Row ${index + 1} has no numeric value for series key "${item.key}" — fill the gap or drop the row.`,
        };
      }
      if (chartType === "pie" && value <= 0) {
        return {
          ok: false,
          error:
            "pie values must all be positive — filter out zero or negative rows, or use bar.",
        };
      }
      out[`s${seriesIndex}`] = value;
    }
    rows.push(out);
  }

  return {
    ok: true,
    chartType,
    title: input.title,
    xLabel: xKey,
    series: series.map((item, index) => ({
      key: `s${index}`,
      label: item.label,
    })),
    rows,
  };
}

export const generateChart = createTool({
  id: "generate-chart",
  description:
    "Draw a simple 2D bar, line or pie chart inline in the chat answer, from data already available in the " +
    "conversation. Use when the user asks for a graph, chart or visualization. The chat UI renders the chart " +
    "itself — do not describe it as a link or file, and do not repeat the data as a table unless asked. " +
    "If the chart type or the columns to plot are ambiguous, ask ONE concise clarifying question before calling.",
  inputSchema,
  execute: async (input) => buildChartSpec(input),
});
