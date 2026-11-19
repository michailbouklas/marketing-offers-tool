// Browser-safe types + URL params + rollup for the marketing (MKT) invoice
// report at /aggregator-offers/invoices/report. SQL lives in
// `mkt-report.server.ts`.

import {
  invoiceAggregators,
  type InvoiceAggregator,
} from "$lib/services/aggregator-invoices/aggregator-invoices";

export const MKT_REPORT_PATH = "/aggregator-offers/invoices/report";

/** Marketing transtypes per aggregator (Bolt splits delivery marketing out). */
export const MKT_TRANSTYPES: Record<InvoiceAggregator, string[]> = {
  wolt: ["MKT"],
  bolt: ["MKT", "MKT_DEL"],
};

export type MktReportView = "chart" | "table";

export type MktReportParams = {
  /** Empty = all aggregators. */
  aggregators: InvoiceAggregator[];
  /** Brand ids; empty = all brands. */
  brands: number[];
  /** Exact store names; empty = all stores. */
  stores: string[];
  invoiceNumber: string | null;
  lineDetails: string | null;
  from: string | null;
  to: string | null;
  view: MktReportView;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/** Lists are repeated keys (`?store=a&store=b`) so values may hold commas. */
export function parseMktReportParams(params: URLSearchParams): MktReportParams {
  const from = params.get("from");
  const to = params.get("to");
  return {
    aggregators: invoiceAggregators.filter((aggregator) =>
      params.getAll("aggregator").includes(aggregator),
    ),
    brands: [
      ...new Set(
        params
          .getAll("brand")
          .map(Number)
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ],
    stores: [
      ...new Set(
        params
          .getAll("store")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ],
    invoiceNumber: text(params.get("invoiceNumber")),
    lineDetails: text(params.get("lineDetails")),
    from: from && DATE.test(from) ? from : null,
    to: to && DATE.test(to) ? to : null,
    view: params.get("view") === "table" ? "table" : "chart",
  };
}

export function mktReportSearch(params: MktReportParams): string {
  const search = new URLSearchParams();
  for (const aggregator of params.aggregators) {
    search.append("aggregator", aggregator);
  }
  for (const brand of params.brands) search.append("brand", String(brand));
  for (const store of params.stores) search.append("store", store);
  if (params.invoiceNumber) search.set("invoiceNumber", params.invoiceNumber);
  if (params.lineDetails) search.set("lineDetails", params.lineDetails);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.view !== "chart") search.set("view", params.view);
  return search.toString();
}

/** One SQL row: an (aggregator, store, month) bucket. Amounts in EUR. */
export type MktReportRow = {
  aggregator: InvoiceAggregator;
  store: string;
  /** YYYY-MM */
  month: string;
  net: number;
  vat: number;
  gross: number;
  /** Bolt MKT_DEL share of `gross` (0 for Wolt). */
  deliveryGross: number;
  lines: number;
  invoices: number;
  /** SAL gross on the same invoices — the % of sales denominator. */
  salesGross: number;
};

export type MktTotals = {
  net: number;
  vat: number;
  gross: number;
  deliveryGross: number;
  lines: number;
  invoices: number;
  salesGross: number;
  /** gross / salesGross × 100; null without sales. */
  pctOfSales: number | null;
};

export type MktSplit = Record<InvoiceAggregator, MktTotals> & {
  total: MktTotals;
};

export type MktReport = {
  /** Sorted by total gross desc. */
  byStore: (MktSplit & { store: string })[];
  /** Sorted by month asc. */
  byMonth: (MktSplit & { month: string })[];
  total: MktSplit;
};

function emptyTotals(): MktTotals {
  return {
    net: 0,
    vat: 0,
    gross: 0,
    deliveryGross: 0,
    lines: 0,
    invoices: 0,
    salesGross: 0,
    pctOfSales: null,
  };
}

function emptySplit(): MktSplit {
  return { wolt: emptyTotals(), bolt: emptyTotals(), total: emptyTotals() };
}

function add(target: MktTotals, row: MktReportRow) {
  target.net += row.net;
  target.vat += row.vat;
  target.gross += row.gross;
  target.deliveryGross += row.deliveryGross;
  target.lines += row.lines;
  target.invoices += row.invoices;
  target.salesGross += row.salesGross;
}

function finish(split: MktSplit) {
  for (const totals of [split.wolt, split.bolt, split.total]) {
    totals.pctOfSales =
      totals.salesGross === 0 ? null : (totals.gross / totals.salesGross) * 100;
  }
}

export function buildMktReport(rows: MktReportRow[]): MktReport {
  const byStore = new Map<string, MktSplit>();
  const byMonth = new Map<string, MktSplit>();
  const total = emptySplit();

  for (const row of rows) {
    for (const [map, key] of [
      [byStore, row.store],
      [byMonth, row.month],
    ] as const) {
      let split = map.get(key);
      if (!split) map.set(key, (split = emptySplit()));
      add(split[row.aggregator], row);
      add(split.total, row);
    }
    add(total[row.aggregator], row);
    add(total.total, row);
  }

  for (const split of [...byStore.values(), ...byMonth.values(), total]) {
    finish(split);
  }

  return {
    byStore: [...byStore]
      .map(([store, split]) => ({ store, ...split }))
      .sort((a, b) => b.total.gross - a.total.gross),
    byMonth: [...byMonth]
      .map(([month, split]) => ({ month, ...split }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    total,
  };
}
