import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { isIsoDate } from "../../../services/sales-dashboard";
import type {
  ItemAnalysisFigures,
  ItemAnalysisReport,
} from "../../../services/sales-item-analysis";
import {
  authorizeBrand,
  DEFAULT_ROWS,
  fromGateway,
  listOfferFilterOptions,
  MAX_ROWS,
  requireGateway,
  resolveFilters,
  toRange,
  type ToolContext,
} from "./sales-offers-tools";

/**
 * Typed tool for the Item Analysis Assistant (agents/item-analysis-agent.ts).
 * Same report as /sales/item-analysis through the sales-offers gateway; the
 * brand / range / channel / location guards are the offers tools' own.
 */

const r2 = (value: number) => Math.round(value * 100) / 100;
/** Fraction -> percent, `digits` decimals. */
const pct = (value: number, digits = 1) =>
  Math.round(value * 100 * 10 ** digits) / 10 ** digits;

function compactFigures(row: ItemAnalysisFigures) {
  return {
    qty: r2(row.qty),
    qtyGrpPct: pct(row.qtyGrp),
    qtyTotPct: pct(row.qtyTot),
    qtyPerTransPct: pct(row.qtyPerTrans, 3),
    trans: row.trans,
    transGrpPct: pct(row.transGrp),
    transTotPct: pct(row.transTot),
    net: r2(row.net),
    netGrpPct: pct(row.netGrp),
    netTotPct: pct(row.netTot),
  };
}

const SORT_KEYS = ["net", "qty", "trans"] as const;

export type ItemAnalysisQuery = {
  categories?: string[] | null;
  search?: string | null;
  sortBy?: (typeof SORT_KEYS)[number] | null;
  limit?: number | null;
};

/** Category totals (all) + the matching items, best first, capped at `limit`. */
export function compactItemAnalysis(
  report: ItemAnalysisReport,
  { categories, search, sortBy, limit }: ItemAnalysisQuery,
) {
  const wanted = (categories ?? []).map((name) => name.trim().toLowerCase());
  const query = search?.trim().toLowerCase() ?? "";
  const key = sortBy ?? "net";
  const items = report.groups
    .filter(
      (group) =>
        wanted.length === 0 || wanted.includes(group.category.toLowerCase()),
    )
    .flatMap((group) =>
      group.items.map((item) => ({ category: group.category, ...item })),
    )
    .filter(
      (item) =>
        !query ||
        item.code.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query),
    )
    .sort((a, b) => b[key] - a[key]);
  const cap = Math.min(limit ?? DEFAULT_ROWS, MAX_ROWS);
  return {
    grandTotal: {
      qty: r2(report.grand.qty),
      trans: report.grand.trans,
      net: r2(report.grand.net),
    },
    categories: report.groups.map((group) => ({
      category: group.category,
      items: group.items.length,
      qty: r2(group.total.qty),
      qtyTotPct: pct(group.total.qtyTot),
      trans: group.total.trans,
      transTotPct: pct(group.total.transTot),
      net: r2(group.total.net),
      netTotPct: pct(group.total.netTot),
    })),
    matchingItems: items.length,
    items: items.slice(0, cap).map((item) => ({
      category: item.category,
      code: item.code,
      name: item.name,
      ...compactFigures(item),
    })),
    truncated: items.length > cap,
  };
}

const isoDate = z
  .string()
  .refine(isIsoDate, "Use a valid YYYY-MM-DD date")
  .describe("YYYY-MM-DD");

// Optional inputs are also nullable: OpenAI strict schemas make the model send every key.
export const getItemAnalysisInputSchema = z.object({
  brand: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .describe(
      "Brand alias (e.g. 'phcy') — one of the brands in the Brand scope section; default: the page's brand.",
    ),
  from: isoDate.describe(
    "Range start YYYY-MM-DD (required; default: the page's range).",
  ),
  to: isoDate.describe("Range end YYYY-MM-DD, inclusive (required)."),
  channels: z
    .array(z.string().trim().min(1).max(100))
    .max(20)
    .nullable()
    .optional()
    .describe(
      "Sales channel names (e.g. 'Wolt'); null = all. Names from listOfferFilterOptions.",
    ),
  locations: z
    .array(z.number().int().min(1).max(32_767))
    .max(200)
    .nullable()
    .optional()
    .describe(
      "POS location ids; null = all. Ids (and their cities) from listOfferFilterOptions.",
    ),
  categories: z
    .array(z.string().trim().min(1).max(100))
    .max(50)
    .nullable()
    .optional()
    .describe(
      "Only items of these POS categories (exact names from a previous call's categories list); null = all.",
    ),
  search: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional()
    .describe("Item code or name contains this text; null = no search."),
  sortBy: z
    .enum(SORT_KEYS)
    .nullable()
    .optional()
    .describe("Item order, highest first; null = net."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_ROWS)
    .nullable()
    .optional()
    .describe(`Items to return; null = ${DEFAULT_ROWS}.`),
});

export const getItemAnalysis = createTool({
  id: "get-item-analysis",
  description:
    "The Item Analysis report exactly as /sales/item-analysis computes it: " +
    "per item quantity, transactions and net sales (excl. VAT), each with Grp % " +
    "(share of its category) and Tot % (share of the selection), plus Qty/Tr % " +
    "(quantity per transaction of the selection). Always returns every " +
    "category total and the grand total; items are filtered by categories / " +
    `search and sorted by sortBy (top ${DEFAULT_ROWS} by default, max ${MAX_ROWS}). ` +
    "Answer category questions from categories, item questions from items, in ONE call.",
  inputSchema: getItemAnalysisInputSchema,
  execute: async (input, context) => {
    const authorized = authorizeBrand(
      input.brand,
      (context as ToolContext)?.requestContext,
    );
    if (!authorized.ok) return authorized;
    const access = requireGateway();
    if (!access.ok) return access;
    const range = toRange(input.from, input.to);
    if (!range.ok) return range;
    const resolved = await resolveFilters(
      access.gateway,
      authorized.brand,
      range.range,
      input.channels,
      input.locations,
    );
    if (!resolved.ok) return resolved;
    const filters = { ...resolved.filters, range: range.range! };

    const outcome = await access.gateway.getItemAnalysis(
      authorized.brand,
      filters,
    );
    if (!outcome.ok) return fromGateway(outcome.error);

    return {
      ok: true as const,
      brand: authorized.brand,
      filters: {
        range: filters.range,
        channels: filters.channels.length > 0 ? filters.channels : "all",
        locations: filters.locations.length > 0 ? filters.locations : "all",
      },
      note:
        outcome.value.groups.length === 0
          ? "No sales match these filters. Say so instead of reporting zero."
          : null,
      ...compactItemAnalysis(outcome.value, input),
    };
  },
});

/** Tools spread into the Item Analysis agent. */
export const itemAnalysisTools = { listOfferFilterOptions, getItemAnalysis };
