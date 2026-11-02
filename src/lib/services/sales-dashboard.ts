/**
 * Shared types + pure helpers for the /sales/dashboard page (browser-safe).
 * The ClickHouse reads live in `sales-dashboard.server.ts`.
 */

export const salesDashboardViews = ["chart", "table"] as const;
export type SalesDashboardView = (typeof salesDashboardViews)[number];

export const SALES_DASHBOARD_DEFAULT_DAYS = 30;
/** Longest range one request may cover (keeps the Excel export under its cell cap). */
export const SALES_DASHBOARD_MAX_DAYS = 366;

export type SalesDashboardFilters = {
  /** Lowercase warehouse brand codes, already intersected with the user's scope. */
  brands: string[];
  from: string;
  to: string;
  locationId: number | null;
  divisionGroup: string | null;
  divisionName: string | null;
};

/** One (day, brand) aggregate row from `transactions`. */
export type SalesDayBrandRow = {
  day: string;
  brand: string;
  net: number;
  txns: number;
};

export type SalesDashboardBrand = { alias: string; name: string };
export type SalesLocationOption = { id: number; name: string };
export type SalesDivisionOption = { group: string; division: string };

/** One row per day; `byBrand[alias]` is zero-filled for every selected brand. */
export type SalesDayRow = {
  day: string;
  byBrand: Record<string, { net: number; txns: number }>;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function isIsoDate(value: string | null | undefined): value is string {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  // Round-trip rejects impossible days such as 2026-02-30.
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed) && new Date(parsed).toISOString().startsWith(value)
  );
}

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Turns URL search params into safe filters. Brands outside `scopedAliases`
 * are dropped (an empty or fully out-of-scope request means every scoped
 * brand), dates default to the last 30 days ending at `latestDay`, and the
 * range is clamped to SALES_DASHBOARD_MAX_DAYS.
 */
export function resolveSalesDashboardFilters(
  params: URLSearchParams,
  scopedAliases: string[],
  latestDay: string,
): SalesDashboardFilters {
  const scoped = new Set(scopedAliases);
  const requested = (params.get("brands") ?? "")
    .split(",")
    .map((alias) => alias.trim().toLowerCase())
    .filter((alias) => scoped.has(alias));
  const brands = requested.length > 0 ? [...new Set(requested)] : scopedAliases;

  const rawFrom = params.get("from");
  const rawTo = params.get("to");
  let to = isIsoDate(rawTo) ? rawTo : latestDay;
  let from = isIsoDate(rawFrom)
    ? rawFrom
    : shiftDays(to, -(SALES_DASHBOARD_DEFAULT_DAYS - 1));

  if (from > to) {
    [from, to] = [to, from];
  }

  const earliest = shiftDays(to, -(SALES_DASHBOARD_MAX_DAYS - 1));
  if (from < earliest) {
    from = earliest;
  }

  const location = Number(params.get("location"));

  return {
    brands,
    from,
    to,
    locationId:
      Number.isInteger(location) && location > 0 && location <= 32_767
        ? location
        : null,
    divisionGroup: blankToNull(params.get("group")),
    divisionName: blankToNull(params.get("division")),
  };
}

/** Search params for a filter set; the default brand set ("all") is omitted. */
export function salesDashboardSearch(
  filters: SalesDashboardFilters,
  options: { allBrands: boolean; view?: SalesDashboardView },
): string {
  const params = new URLSearchParams();

  if (!options.allBrands) {
    params.set("brands", filters.brands.join(","));
  }
  if (filters.from && filters.to) {
    params.set("from", filters.from);
    params.set("to", filters.to);
  }
  if (filters.locationId !== null) {
    params.set("location", String(filters.locationId));
  }
  if (filters.divisionGroup) {
    params.set("group", filters.divisionGroup);
  }
  if (filters.divisionName) {
    params.set("division", filters.divisionName);
  }
  if (options.view && options.view !== "chart") {
    params.set("view", options.view);
  }

  return params.toString();
}

/** Pivots sparse (day, brand) rows into one zero-filled row per calendar day. */
export function buildSalesDayRows(
  rows: SalesDayBrandRow[],
  brands: string[],
  from: string,
  to: string,
): SalesDayRow[] {
  const byDay = new Map<string, SalesDayRow>();

  for (let day = from; day <= to; day = shiftDays(day, 1)) {
    byDay.set(day, {
      day,
      byBrand: Object.fromEntries(
        brands.map((brand) => [brand, { net: 0, txns: 0 }]),
      ),
    });
  }

  for (const row of rows) {
    const target = byDay.get(row.day)?.byBrand[row.brand];
    if (target) {
      target.net += row.net;
      target.txns += row.txns;
    }
  }

  return [...byDay.values()];
}

const salesAmountFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
});

/** €12,345.67 */
export function formatSalesAmount(value: number): string {
  return salesAmountFormatter.format(value);
}

export function formatSalesCount(value: number): string {
  return value.toLocaleString("en-GB");
}
