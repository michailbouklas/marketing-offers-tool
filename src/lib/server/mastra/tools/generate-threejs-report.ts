import { createTool } from "@mastra/core/tools";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getObjectStore } from "../object-store";
import { getThreeAssets } from "./threejs-assets";
import {
  buildThreeJsReportHtml,
  SERIES_PALETTE,
  type ThreeJsChartType,
} from "./threejs-report-html";

const MAX_LABELS = 100;
/** Capped at the categorical palette size — hues are never cycled. */
const MAX_SERIES = SERIES_PALETTE.length;
const MAX_PIE_SLICES = SERIES_PALETTE.length;
const MAX_POINTS = 500;
const MAX_TOTAL_VALUES = 2_000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const HTML_MIME = "text/html; charset=utf-8";

export type GenerateThreeJsReportResult =
  | {
      ok: true;
      fileId: string;
      filename: string;
      /** Opens the interactive report inline (new tab). */
      openUrl: string;
      /** Same file with a forced attachment disposition. */
      downloadUrl: string;
      chartType: ThreeJsChartType;
      pointCount: number;
    }
  | { ok: false; error: string };

/** Restrict to download-header-safe characters and force the .html suffix. */
function sanitizeFilename(raw: string): string {
  const base = raw
    .replace(/\.html?$/i, "")
    .replace(/[^A-Za-z0-9 ._()-]+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, 96)
    .trim();
  return `${base || "report"}.html`;
}

const finiteNumber = z.number().finite();

const inputSchema = z.object({
  filename: z
    .string()
    .describe(
      'Descriptive filename, e.g. "sales-by-brand-june-2026.html". Letters, digits, spaces, ._()- only.',
    ),
  title: z
    .string()
    .min(1)
    .max(120)
    .describe("Report headline shown at the top of the page."),
  subtitle: z
    .string()
    .max(200)
    .optional()
    .describe("Optional one-line context under the title (period, filters…)."),
  chartType: z
    .enum(["bar3d", "line3d", "pie3d", "scatter3d"])
    .describe(
      "bar3d: compare categories (labels + series). line3d: trends over ordered labels (labels + series). " +
        "pie3d: share of a whole (labels + exactly ONE series of positive values). " +
        "scatter3d: three numeric dimensions (points only).",
    ),
  labels: z
    .array(z.string().min(1).max(120))
    .max(MAX_LABELS)
    .optional()
    .describe(
      "Category labels (x-axis / pie slices). Required for bar3d, line3d and pie3d; unused for scatter3d.",
    ),
  series: z
    .array(
      z.object({
        name: z.string().min(1).max(120).describe("Series name (legend)."),
        values: z
          .array(finiteNumber)
          .min(1)
          .max(MAX_LABELS)
          .describe("One value per label, same order as labels."),
      }),
    )
    .max(MAX_SERIES)
    .optional()
    .describe(
      `Data series (max ${MAX_SERIES}). Required for bar3d, line3d and pie3d; unused for scatter3d.`,
    ),
  points: z
    .array(
      z.object({
        x: finiteNumber,
        y: finiteNumber,
        z: finiteNumber,
        label: z.string().max(120).optional(),
      }),
    )
    .max(MAX_POINTS)
    .optional()
    .describe(`Only for scatter3d (max ${MAX_POINTS} points).`),
  options: z
    .object({
      valueLabel: z
        .string()
        .max(60)
        .optional()
        .describe('Unit for the value axis, e.g. "EUR" or "orders".'),
      xLabel: z.string().max(60).optional().describe("scatter3d x-axis name."),
      yLabel: z.string().max(60).optional().describe("scatter3d y-axis name."),
      zLabel: z.string().max(60).optional().describe("scatter3d z-axis name."),
    })
    .optional(),
});

type GenerateThreeJsReportInput = z.infer<typeof inputSchema>;

/**
 * Validates the cross-field shape per chart type. Errors are written as
 * instructions to the model — when the gap is a missing user decision, the
 * instruction is to ask the user, not to guess.
 */
function validateInput(input: GenerateThreeJsReportInput): string | null {
  const { chartType, labels, series, points } = input;

  if (chartType === "scatter3d") {
    if (!points?.length) {
      return "chartType scatter3d needs points ({x, y, z} objects). If the data has no three numeric dimensions, pick bar3d/line3d instead — ask the user which representation they want if that is unclear.";
    }
    return null;
  }

  if (!labels?.length || !series?.length) {
    return `chartType ${chartType} needs labels and series — ask the user which columns to plot if that is unclear.`;
  }
  for (const s of series) {
    if (s.values.length !== labels.length) {
      return `Series "${s.name}" has ${s.values.length} value(s) but there are ${labels.length} label(s) — every series needs exactly one value per label, in the same order.`;
    }
  }
  const totalValues = series.length * labels.length;
  if (totalValues > MAX_TOTAL_VALUES) {
    return `${totalValues} values exceed the ${MAX_TOTAL_VALUES} limit — aggregate the data first (fewer categories or series) and retry.`;
  }

  if (chartType === "pie3d") {
    if (series.length !== 1) {
      return "chartType pie3d needs exactly one series (the slice values). Pass a single series, or use bar3d to compare multiple series.";
    }
    if (labels.length > MAX_PIE_SLICES) {
      return `pie3d supports at most ${MAX_PIE_SLICES} slices — group the smallest categories into an "Other" slice first.`;
    }
    if (series[0].values.some((v) => v <= 0)) {
      return "pie3d values must all be positive — a share-of-total chart cannot show zero or negative slices. Filter them out or use bar3d.";
    }
  }
  return null;
}

export async function generateThreeJsReportFile(
  input: GenerateThreeJsReportInput,
): Promise<GenerateThreeJsReportResult> {
  const startedAt = Date.now();
  const validationError = validateInput(input);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const filename = sanitizeFilename(input.filename);
  const pointCount =
    input.chartType === "scatter3d"
      ? (input.points?.length ?? 0)
      : (input.series?.length ?? 0) * (input.labels?.length ?? 0);

  try {
    const assets = await getThreeAssets();
    const generatedAt = `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
    const html = buildThreeJsReportHtml({ ...input, generatedAt }, assets);
    const bytes = Buffer.from(html, "utf8");
    if (bytes.length > MAX_FILE_BYTES) {
      return {
        ok: false,
        error: `Generated report is too large (${bytes.length} bytes > ${MAX_FILE_BYTES}) — reduce the amount of data.`,
      };
    }

    const fileId = randomUUID();
    await getObjectStore().put(
      `ai-exports/${fileId}/${filename}`,
      bytes,
      HTML_MIME,
    );

    console.log(
      `[generate-threejs-report] ${filename}: ${input.chartType}, ${pointCount} value(s), ${bytes.length} bytes in ${Date.now() - startedAt}ms`,
    );

    const openUrl = `/api/ai/files/${fileId}/${encodeURIComponent(filename)}`;
    return {
      ok: true,
      fileId,
      filename,
      openUrl,
      downloadUrl: `${openUrl}?download=1`,
      chartType: input.chartType,
      pointCount,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(
      `[generate-threejs-report] failed in ${Date.now() - startedAt}ms: ${message}`,
    );
    return { ok: false, error: `3D report generation failed: ${message}` };
  }
}

export const generateThreeJsReport = createTool({
  id: "generate-threejs-report",
  description:
    "Generate an interactive 3D chart report (standalone HTML page rendered with three.js) from data already " +
    "available in the conversation. Use when the user asks for a graph, chart, or visualization. Returns URLs " +
    "the chat UI renders as an open/download card — never invent, alter, or repeat those URLs in your reply. " +
    "If the chart type or which columns to plot is ambiguous, ask ONE concise clarifying question before " +
    'calling. Load the "threejs-reports" skill for chart-type guidance and worked examples.',
  inputSchema,
  execute: async (input) => {
    return generateThreeJsReportFile(input);
  },
});
