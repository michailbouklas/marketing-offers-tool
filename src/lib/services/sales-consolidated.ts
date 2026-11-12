/**
 * Shared types + pure helpers for /sales/consolidated-sales-report
 * (browser-safe). Brand, date and channel filters reuse the sales dashboard
 * parser; this module adds the store, city and weekday filters.
 */
import type { SalesDashboardFilters } from "./sales-dashboard";

export const WEEKDAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
] as const;

export type ConsolidatedExtras = {
  /** `store_bi_name` values; empty means every store. */
  stores: string[];
  /** `dim_store.district` values; empty means every city. */
  cities: string[];
  /** ISO weekdays (1 = Monday); empty means every day. */
  weekdays: number[];
};

export type ConsolidatedStoreOption = {
  store: string;
  location: string;
  city: string;
};

export type ConsolidatedRow = {
  company: string;
  companyLabel: string;
  store: string;
  location: string;
  city: string;
  trans: number;
  gross: number;
  discount: number;
  net: number;
};

export type ConsolidatedTotals = {
  trans: number;
  gross: number;
  discount: number;
  net: number;
  avgGross: number | null;
  avgNet: number | null;
};

export type ConsolidatedLine = ConsolidatedRow & ConsolidatedTotals;

export type ConsolidatedGroup = {
  company: string;
  label: string;
  rows: ConsolidatedLine[];
  total: ConsolidatedTotals;
};

export type ConsolidatedReport = {
  groups: ConsolidatedGroup[];
  total: ConsolidatedTotals;
};

function csv(value: string | null): string[] {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  ];
}

export function parseConsolidatedExtras(
  params: URLSearchParams,
): ConsolidatedExtras {
  return {
    stores: csv(params.get("stores")),
    cities: csv(params.get("cities")),
    weekdays: csv(params.get("weekdays"))
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
      .sort((a, b) => a - b),
  };
}

/** URL search for the report; the default brand set ("all") is omitted. */
export function consolidatedSearch(
  filters: Pick<SalesDashboardFilters, "brands" | "from" | "to" | "channels">,
  extras: ConsolidatedExtras,
  allBrands: boolean,
): string {
  const params = new URLSearchParams();
  if (!allBrands) params.set("brands", filters.brands.join(","));
  if (filters.from && filters.to) {
    params.set("from", filters.from);
    params.set("to", filters.to);
  }
  const lists = {
    channels: filters.channels,
    stores: extras.stores,
    cities: extras.cities,
    weekdays: extras.weekdays.map(String),
  };
  for (const [key, values] of Object.entries(lists)) {
    if (values.length > 0) params.set(key, values.join(","));
  }
  return params.toString();
}

function totals(rows: ConsolidatedRow[]): ConsolidatedTotals {
  const sum = (key: "trans" | "gross" | "discount" | "net") =>
    rows.reduce((acc, row) => acc + row[key], 0);
  const trans = sum("trans");
  const gross = sum("gross");
  const net = sum("net");
  return {
    trans,
    gross,
    discount: sum("discount"),
    net,
    avgGross: trans === 0 ? null : gross / trans,
    avgNet: trans === 0 ? null : net / trans,
  };
}

/** Company → location, sorted by name, with company subtotals and a grand total. */
export function buildConsolidatedReport(
  rows: ConsolidatedRow[],
): ConsolidatedReport {
  const byCompany = new Map<string, ConsolidatedRow[]>();
  for (const row of rows) {
    byCompany.set(row.company, [...(byCompany.get(row.company) ?? []), row]);
  }
  const groups = [...byCompany.values()]
    .map((companyRows) => ({
      company: companyRows[0].company,
      label: companyRows[0].companyLabel,
      rows: companyRows
        .map((row) => ({ ...row, ...totals([row]) }))
        .sort((a, b) => a.location.localeCompare(b.location)),
      total: totals(companyRows),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return { groups, total: totals(rows) };
}
