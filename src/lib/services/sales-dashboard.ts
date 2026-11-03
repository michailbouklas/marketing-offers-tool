/**
 * Shared types + pure helpers for the /sales/dashboard page (browser-safe).
 * The ClickHouse reads live in `sales-dashboard.server.ts`.
 */

export const SALES_DASHBOARD_DEFAULT_DAYS = 30;
/** Longest range one request may cover (keeps the Excel export under its cell cap). */
export const SALES_DASHBOARD_MAX_DAYS = 366;
/** Prior years averaged by the "same range, all-time average" row. */
export const SALES_DASHBOARD_HISTORY_YEARS = 10;

export type SalesDashboardFilters = {
  /** Lowercase warehouse brand codes, already intersected with the user's scope. */
  brands: string[];
  from: string;
  to: string;
  locationId: number | null;
  divisionGroup: string | null;
  divisionName: string | null;
  /** `dim_division_group_channel` values; empty means every channel. */
  channels: string[];
};

export type SalesDashboardBrand = { alias: string; name: string };
export type SalesLocationOption = { id: number; name: string };
export type SalesDivisionOption = { group: string; division: string };

/** One day of the selected brand: net = sales minus returns, txns = sales rows. */
export type SalesDayTotal = { day: string; net: number; txns: number };

/** One store, current range plus the same range last year. */
export type SalesStoreRow = {
  location: string;
  store: string;
  net: number;
  txns: number;
  lyNet: number;
  lyTxns: number;
};

export type SalesCompare = {
  thisYear: number | null;
  lastYear: number | null;
  pct: number | null;
};

export type SalesMetricCompare = {
  net: SalesCompare;
  txns: SalesCompare;
  atv: SalesCompare;
};

export type SalesDailyRow = {
  day: string;
  net: number;
  txns: number;
  atv: number | null;
  lyNet: number;
  lyPct: number | null;
};

export type SalesPeriodRow = {
  label: string;
  net: number | null;
  txns: number | null;
  atv: number | null;
};

export type SalesDashboard = {
  compare: {
    wtd: SalesMetricCompare;
    mtd: SalesMetricCompare;
    ytd: SalesMetricCompare;
  };
  range: SalesMetricCompare;
  daily: SalesDailyRow[];
  weekly: { week: string; net: number }[];
  periods: SalesPeriodRow[];
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

/** Same calendar day `years` away; Feb 29 lands on Feb 28 like ClickHouse `addYears`. */
export function shiftYears(iso: string, years: number): string {
  const year = Number(iso.slice(0, 4)) + years;
  const shifted = `${year}${iso.slice(4)}`;
  return isIsoDate(shifted) ? shifted : `${year}${iso.slice(4, 8)}28`;
}

/** Monday of the ISO week (ClickHouse `toStartOfWeek(d, 1)`). */
export function startOfWeek(iso: string): string {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return shiftDays(iso, -((weekday + 6) % 7));
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function csv(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
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
  const requested = csv(params.get("brands"))
    .map((alias) => alias.toLowerCase())
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
    channels: [...new Set(csv(params.get("channels")))],
  };
}

/**
 * The dashboard shows one brand: the only brand in the URL, otherwise the
 * first scoped brand (a multi-brand URL from elsewhere collapses to it).
 */
export function withSingleBrand(
  filters: SalesDashboardFilters,
): SalesDashboardFilters {
  return { ...filters, brands: filters.brands.slice(0, 1) };
}

/** Search params for a filter set; the default brand set ("all") is omitted. */
export function salesDashboardSearch(
  filters: SalesDashboardFilters,
  options: { allBrands: boolean },
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
  if (filters.channels.length > 0) {
    params.set("channels", filters.channels.join(","));
  }

  return params.toString();
}

function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = shiftDays(day, 1)) {
    days.push(day);
  }
  return days;
}

function pctChange(current: number | null, previous: number | null) {
  return current === null || previous === null || previous === 0
    ? null
    : (current - previous) / Math.abs(previous);
}

function compare(
  thisYear: number | null,
  lastYear: number | null,
): SalesCompare {
  return { thisYear, lastYear, pct: pctChange(thisYear, lastYear) };
}

function atv(net: number, txns: number): number | null {
  return txns === 0 ? null : net / txns;
}

/**
 * Every Grafana panel from the daily totals. `days` must cover `from - 10y`
 * through `to` (see SALES_DASHBOARD_HISTORY_YEARS); missing days count as 0.
 * WTD/MTD/YTD are anchored on `to`, "last year" is the same calendar dates
 * one year earlier (not weekday-aligned, as in the Grafana original).
 */
export function buildSalesDashboard(
  days: SalesDayTotal[],
  from: string,
  to: string,
): SalesDashboard {
  const byDay = new Map(days.map((day) => [day.day, day]));
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));

  const totals = (start: string, end: string) => {
    let net = 0;
    let txns = 0;
    for (const day of sorted) {
      if (day.day >= start && day.day <= end) {
        net += day.net;
        txns += day.txns;
      }
    }
    return { net, txns };
  };

  const compareWindow = (start: string, end: string): SalesMetricCompare => {
    const current = totals(start, end);
    const previous = totals(shiftYears(start, -1), shiftYears(end, -1));
    return {
      net: compare(current.net, previous.net),
      txns: compare(current.txns, previous.txns),
      atv: compare(
        atv(current.net, current.txns),
        atv(previous.net, previous.txns),
      ),
    };
  };

  const daily = eachDay(from, to).map((day) => {
    const current = byDay.get(day);
    const net = current?.net ?? 0;
    const txns = current?.txns ?? 0;
    const lyNet = byDay.get(shiftYears(day, -1))?.net ?? 0;
    return {
      day,
      net,
      txns,
      atv: atv(net, txns),
      lyNet,
      lyPct: pctChange(net, lyNet),
    };
  });

  const weeks = new Map<string, number>();
  for (const day of daily) {
    const week = startOfWeek(day.day);
    weeks.set(week, (weeks.get(week) ?? 0) + day.net);
  }

  const current = totals(from, to);
  const lastYear = totals(shiftYears(from, -1), shiftYears(to, -1));
  // Only prior years that actually have sales count towards the average.
  const history = Array.from(
    { length: SALES_DASHBOARD_HISTORY_YEARS },
    (_, index) =>
      totals(shiftYears(from, -(index + 1)), shiftYears(to, -(index + 1))),
  ).filter((year) => year.txns > 0);
  const avgNet = history.length
    ? history.reduce((sum, year) => sum + year.net, 0) / history.length
    : null;
  const avgTxns = history.length
    ? history.reduce((sum, year) => sum + year.txns, 0) / history.length
    : null;

  return {
    compare: {
      wtd: compareWindow(startOfWeek(to), to),
      mtd: compareWindow(`${to.slice(0, 8)}01`, to),
      ytd: compareWindow(`${to.slice(0, 5)}01-01`, to),
    },
    range: compareWindow(from, to),
    daily,
    weekly: [...weeks].map(([week, net]) => ({ week, net })),
    periods: [
      {
        label: "Selected range",
        ...current,
        atv: atv(current.net, current.txns),
      },
      {
        label: "Same range last year",
        ...lastYear,
        atv: atv(lastYear.net, lastYear.txns),
      },
      {
        label: `Same range, average of prior years (${history.length})`,
        net: avgNet,
        txns: avgTxns,
        atv: avgNet !== null && avgTxns ? avgNet / avgTxns : null,
      },
    ],
  };
}

/** Store rows with their vs-last-year changes, biggest net sales first. */
export function buildSalesStoreRows(rows: SalesStoreRow[]) {
  return [...rows]
    .sort((a, b) => b.net - a.net)
    .map((row) => {
      const rowAtv = atv(row.net, row.txns);
      const lyAtv = atv(row.lyNet, row.lyTxns);
      return {
        ...row,
        atv: rowAtv,
        netPct: pctChange(row.net, row.lyNet),
        txnsPct: pctChange(row.txns, row.lyTxns),
        atvPct: pctChange(rowAtv, lyAtv),
      };
    });
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

const pctFormatter = new Intl.NumberFormat("en-GB", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

/** +4.25 % / – when there is no comparison base. */
export function formatSalesPct(value: number | null): string {
  return value === null ? "–" : pctFormatter.format(value);
}

/** Grafana thresholds: red below −5 %, yellow −5 %…0, green from 0 up. */
export function salesPctTone(
  value: number | null,
): "good" | "warn" | "bad" | "none" {
  if (value === null) return "none";
  if (value >= 0) return "good";
  return value >= -0.05 ? "warn" : "bad";
}
