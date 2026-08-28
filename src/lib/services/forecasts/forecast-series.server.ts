import { clickhouse } from "$lib/server/clickhouse";
import { getForecastEnv } from "$lib/server/env";
import type { DailySalesPoint, ForecastLocation } from "./forecast-types";

/**
 * Server-only ClickHouse reads for the Sales Forecasts feature. Pulls the
 * brand-level daily revenue + order-count series from the POS `transactions`
 * table (`tran_net` = revenue, `tran_sales_factor = 1` = sales rows, `brand`
 * = lowercase warehouse code, partitioned by month on `tran_date`).
 *
 * Every query carries a `tran_date` filter so ClickHouse can prune partitions,
 * and the brand is bound as a query parameter and compared with `lower()`.
 * The series is returned sparse (days without sales are absent) — the Python
 * engine reindexes to a daily calendar and zero-fills.
 */

// The database name is interpolated into query strings (identifiers cannot be
// bound as query_params), so it must be a strict identifier to rule out any
// env-based SQL injection — same trick as `google-reviews-db.ts`.
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_]+$/;

/** How far back `getLatestSalesDate` looks first (cheap partition-pruned probe). */
export const LATEST_SALES_PROBE_DAYS = 60;

export type DateWindow = { from: string; to: string };

/** Fully qualified `transactions` table for query strings. */
export function salesTransactionsTable(
  database: string = getForecastEnv().CLICKHOUSE_SALES_DATABASE,
): string {
  if (!IDENTIFIER_PATTERN.test(database)) {
    throw new Error(
      `Invalid CLICKHOUSE_SALES_DATABASE: must match ${IDENTIFIER_PATTERN}`,
    );
  }

  return `${database}.transactions`;
}

/** Decimal / UInt64 columns arrive as strings over JSONEachRow. */
export function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = Number.parseFloat(value.trim());

  return Number.isFinite(parsed) ? parsed : 0;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(iso: string): number {
  if (!ISO_DATE_PATTERN.test(iso)) {
    throw new Error(`Expected an ISO date (YYYY-MM-DD), received "${iso}"`);
  }

  const [year, month, day] = iso.split("-").map((part) => Number(part));
  return Date.UTC(year, month - 1, day);
}

/** `YYYY-MM-DD` in UTC. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Adds `days` (may be negative) to an ISO date, UTC-safe (no DST drift). */
export function addDays(iso: string, days: number): string {
  return toIsoDate(new Date(parseIsoDate(iso) + days * 86_400_000));
}

/** Calendar days from `from` to `to` (0 when equal, negative when reversed). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseIsoDate(to) - parseIsoDate(from)) / 86_400_000);
}

/**
 * Lookback window ending at the brand's latest sales date: `days` calendar
 * days inclusive of `latest` (so `days = 1` is just `latest`).
 */
export function computeHistoryWindow(latest: string, days: number): DateWindow {
  const span = Math.max(1, Math.floor(days));
  return { from: addDays(latest, -(span - 1)), to: latest };
}

/**
 * Calendar days without a sales row between the first observed day inside the
 * window and the window end. Leading absence (the brand did not exist yet) is
 * not counted, mirroring the engine's leading-zero trim. An empty series
 * counts every day of the window.
 */
export function countMissingDays(
  series: readonly { ds: string }[],
  window: DateWindow,
): number {
  const inWindow = series.filter(
    (point) => point.ds >= window.from && point.ds <= window.to,
  );

  if (inWindow.length === 0) {
    return daysBetween(window.from, window.to) + 1;
  }

  const first = inWindow.reduce(
    (min, point) => (point.ds < min ? point.ds : min),
    inWindow[0].ds,
  );
  const expected = daysBetween(first, window.to) + 1;
  const present = new Set(inWindow.map((point) => point.ds)).size;

  return Math.max(0, expected - present);
}

function normaliseBrand(brandAlias: string): string {
  return brandAlias.trim().toLowerCase();
}

/**
 * Optional `tran_location` predicate. `null`/`undefined` = every location of
 * the brand. The id is bound as a query parameter (Int16 like the column).
 */
function locationFilter(locationId: number | null | undefined): {
  sql: string;
  params: Record<string, number>;
} {
  if (locationId === null || locationId === undefined) {
    return { sql: "", params: {} };
  }
  if (!Number.isSafeInteger(locationId)) {
    throw new Error(`Invalid location id: ${String(locationId)}`);
  }
  return {
    sql: "AND tran_location = {location:Int16}",
    params: { location: locationId },
  };
}

async function queryLatestSalesDate(
  table: string,
  brand: string,
  probeFrom: string,
  locationId?: number | null,
): Promise<string | null> {
  const location = locationFilter(locationId);
  const result = await clickhouse.query({
    query: `
      SELECT tran_date AS ds
      FROM ${table}
      WHERE tran_date >= {probe_from:Date}
        AND tran_date <= today()
        AND lower(brand) = {brand:String}
        AND tran_sales_factor = 1
        ${location.sql}
      ORDER BY tran_date DESC
      LIMIT 1
    `,
    query_params: { probe_from: probeFrom, brand, ...location.params },
    format: "JSONEachRow",
  });

  const rows = await result.json<{ ds: string }>();
  const ds = rows[0]?.ds;

  return typeof ds === "string" && ISO_DATE_PATTERN.test(ds) ? ds : null;
}

/**
 * The brand's most recent day with sales — the forecast cutoff. Never
 * `today()`: the warehouse lags, and forecasting from a partial day would
 * bias the model. Probes the last {@link LATEST_SALES_PROBE_DAYS} days first
 * (cheap, partition-pruned); when the brand has been quiet longer than that,
 * falls back to the configured history lookback. Returns null when the brand
 * has no sales rows in either window.
 */
export async function getLatestSalesDate(
  brandAlias: string,
  options: {
    now?: Date;
    historyDays?: number;
    locationId?: number | null;
  } = {},
): Promise<string | null> {
  const env = getForecastEnv();
  const table = salesTransactionsTable(env.CLICKHOUSE_SALES_DATABASE);
  const brand = normaliseBrand(brandAlias);
  const today = toIsoDate(options.now ?? new Date());
  const historyDays = options.historyDays ?? env.FORECAST_HISTORY_DAYS;

  const recent = await queryLatestSalesDate(
    table,
    brand,
    addDays(today, -LATEST_SALES_PROBE_DAYS),
    options.locationId,
  );
  if (recent !== null) {
    return recent;
  }

  if (historyDays <= LATEST_SALES_PROBE_DAYS) {
    return null;
  }

  return queryLatestSalesDate(
    table,
    brand,
    addDays(today, -historyDays),
    options.locationId,
  );
}

/**
 * Daily revenue (`sum(tran_net)`) and order count for one brand — optionally
 * one `tran_location` of it — between two inclusive ISO dates. Sparse: days
 * without sales are absent.
 */
export async function getDailySalesSeries(params: {
  brandAlias: string;
  from: string;
  to: string;
  locationId?: number | null;
}): Promise<DailySalesPoint[]> {
  const table = salesTransactionsTable();
  parseIsoDate(params.from);
  parseIsoDate(params.to);
  const location = locationFilter(params.locationId);

  const result = await clickhouse.query({
    query: `
      SELECT tran_date AS ds, sum(tran_net) AS revenue, count() AS orders
      FROM ${table}
      WHERE tran_date BETWEEN {from:Date} AND {to:Date}
        AND lower(brand) = {brand:String}
        AND tran_sales_factor = 1
        ${location.sql}
      GROUP BY tran_date
      ORDER BY tran_date
    `,
    query_params: {
      from: params.from,
      to: params.to,
      brand: normaliseBrand(params.brandAlias),
      ...location.params,
    },
    format: "JSONEachRow",
  });

  const rows = await result.json<{
    ds: string;
    revenue: string | number | null;
    orders: string | number | null;
  }>();

  return rows.map((row) => ({
    ds: row.ds,
    revenue: toNumber(row.revenue),
    orders: toNumber(row.orders),
  }));
}

export type SalesHistorySummary = {
  latestSalesDate: string;
  /** Days with sales inside the lookback window (drives "model needs N days"). */
  historyDays: number;
  /** The last `recentDays` points of the series (sparse). */
  points: DailySalesPoint[];
};

/**
 * One-shot summary for `GET /api/forecasts/history` and the page loads:
 * latest sales date, count of days with sales in the lookback window, and the
 * most recent `recentDays` points for the actuals line. Null when the brand
 * has no sales data at all.
 */
export async function getSalesHistorySummary(
  brandAlias: string,
  options: {
    historyDays?: number;
    recentDays: number;
    now?: Date;
    locationId?: number | null;
  },
): Promise<SalesHistorySummary | null> {
  const historyDays =
    options.historyDays ?? getForecastEnv().FORECAST_HISTORY_DAYS;
  const locationId = options.locationId ?? null;
  const latestSalesDate = await getLatestSalesDate(brandAlias, {
    now: options.now,
    historyDays,
    locationId,
  });

  if (latestSalesDate === null) {
    return null;
  }

  const window = computeHistoryWindow(latestSalesDate, historyDays);
  const series = await getDailySalesSeries({
    brandAlias,
    ...window,
    locationId,
  });
  const recent = Math.max(0, Math.floor(options.recentDays));

  return {
    latestSalesDate,
    historyDays: series.length,
    points: recent > 0 ? series.slice(-recent) : [],
  };
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

/** How long a brand's location list is reused before ClickHouse is asked again. */
export const LOCATIONS_CACHE_TTL_MS = 10 * 60 * 1000;

type LocationsCacheEntry = { at: number; locations: ForecastLocation[] };
const locationsCache = new Map<string, LocationsCacheEntry>();

/** Test helper — drops the per-brand location cache. */
export function __clearForecastLocationsCache(): void {
  locationsCache.clear();
}

/**
 * Locations (`tran_location` + `location_name`) of one brand that recorded
 * sales inside the forecast lookback window, alphabetically by name. Cached
 * per brand for {@link LOCATIONS_CACHE_TTL_MS}. Used to populate the location
 * filter and to validate a requested location before it is queried.
 */
export async function listBrandLocations(
  brandAlias: string,
  options: { now?: Date; historyDays?: number } = {},
): Promise<ForecastLocation[]> {
  const env = getForecastEnv();
  const brand = normaliseBrand(brandAlias);
  const now = options.now ?? new Date();
  const cached = locationsCache.get(brand);
  if (cached && now.getTime() - cached.at < LOCATIONS_CACHE_TTL_MS) {
    return cached.locations;
  }

  const table = salesTransactionsTable(env.CLICKHOUSE_SALES_DATABASE);
  const historyDays = options.historyDays ?? env.FORECAST_HISTORY_DAYS;
  const result = await clickhouse.query({
    query: `
      SELECT tran_location AS id, anyLast(location_name) AS name
      FROM ${table}
      WHERE tran_date >= {from:Date}
        AND tran_date <= today()
        AND lower(brand) = {brand:String}
        AND tran_sales_factor = 1
      GROUP BY tran_location
      ORDER BY name, id
    `,
    query_params: { from: addDays(toIsoDate(now), -historyDays), brand },
    format: "JSONEachRow",
  });

  const rows = await result.json<{
    id: string | number;
    name: string | null;
  }>();
  const locations: ForecastLocation[] = rows
    .map((row) => {
      const id = Math.trunc(toNumber(row.id));
      const name = (row.name ?? "").trim();
      return { id, name: name.length > 0 ? name : `Location ${id}` };
    })
    .filter((location) => Number.isSafeInteger(location.id));

  locationsCache.set(brand, { at: now.getTime(), locations });
  return locations;
}
