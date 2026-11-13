import type { RequestEvent } from "@sveltejs/kit";
import { clickhouse } from "$lib/server/clickhouse";
import { listScopedBrands } from "$lib/server/brand-scope.server";
import { getAuthenticatedUserRole } from "$lib/server/auth-guards";
import {
  addDays,
  salesTransactionsTable,
  toIsoDate,
  toNumber,
} from "$lib/services/forecasts/forecast-series.server";
import {
  resolveSalesDashboardFilters,
  SALES_DASHBOARD_HISTORY_YEARS,
  shiftYears,
  type SalesDashboardBrand,
  type SalesDashboardFilters,
  type SalesDayTotal,
  type SalesDivisionOption,
  type SalesLocationOption,
  type SalesStoreRow,
} from "./sales-dashboard";

/**
 * Server-only ClickHouse reads for /sales/dashboard. Net sales =
 * `tran_net * tran_sales_factor` (returns netted out), transactions = sales
 * rows only (`tran_sales_factor = 1`), and every query is bound
 * to the caller's scoped brand codes plus a `tran_date` window so partitions
 * are pruned. Divisions are filtered by name: `tran_division` ids are shared
 * across brands and some ids carry several names.
 */

export type SalesDashboardScope = {
  brands: SalesDashboardBrand[];
  filters: SalesDashboardFilters;
};

/**
 * Resolves the caller's brand scope (server-side, admins see all active
 * brands — same rule as Sales Chat) and the URL filters intersected with it.
 * Returns null when the user has no brands, so callers run no query.
 */
export async function resolveSalesDashboardScope(
  event: RequestEvent,
  userId: string,
): Promise<SalesDashboardScope | null> {
  const scoped = await listScopedBrands({
    id: userId,
    role: await getAuthenticatedUserRole(event),
  });
  const brands = scoped
    .map((brand) => ({
      alias: brand.alias.toLowerCase(),
      name: brand.name || brand.alias,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (brands.length === 0) {
    return null;
  }

  const aliases = brands.map((brand) => brand.alias);

  return {
    brands,
    filters: resolveSalesDashboardFilters(
      event.url.searchParams,
      aliases,
      await getLatestSalesDay(aliases),
    ),
  };
}

/** Latest loaded `tran_date` for the brands (the warehouse lags ~1 day). */
export async function getLatestSalesDay(brands: string[]): Promise<string> {
  const today = toIsoDate(new Date());
  const result = await clickhouse.query({
    query: `
      SELECT toString(max(tran_date)) AS day
      FROM ${salesTransactionsTable()}
      WHERE tran_date BETWEEN {from:Date} AND {today:Date}
        AND lower(brand) IN {brands:Array(String)}
        AND tran_sales_factor = 1
    `,
    query_params: { from: addDays(today, -60), today, brands },
    format: "JSONEachRow",
  });
  const [row] = await result.json<{ day: string }>();

  // max() over no rows yields 1970-01-01.
  return row && row.day > "1970-01-01" ? row.day : addDays(today, -1);
}

export function filterClause(filters: SalesDashboardFilters) {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {
    from: filters.from,
    to: filters.to,
    brands: filters.brands,
  };

  if (filters.locationId !== null) {
    clauses.push("AND tran_location = {location:Int16}");
    params.location = filters.locationId;
  }
  if (filters.divisionGroup) {
    clauses.push("AND dim_division_group_name = {group:String}");
    params.group = filters.divisionGroup;
  }
  if (filters.divisionName) {
    clauses.push("AND division_name = {division:String}");
    params.division = filters.divisionName;
  }
  if (filters.channels.length > 0) {
    clauses.push(
      "AND trim(dim_division_group_channel) IN {channels:Array(String)}",
    );
    params.channels = filters.channels;
  }

  return { sql: clauses.join("\n        "), params };
}

/** Daily totals for the dashboard's single brand, `from - 10y` through `to`. */
export async function getSalesDailyTotals(
  filters: SalesDashboardFilters,
): Promise<SalesDayTotal[]> {
  const extra = filterClause(filters);
  const result = await clickhouse.query({
    query: `
      SELECT toString(tran_date) AS day,
             sum(tran_net * tran_sales_factor) AS net,
             countIf(tran_sales_factor = 1) AS txns
      FROM ${salesTransactionsTable()}
      WHERE tran_date BETWEEN {historyFrom:Date} AND {to:Date}
        AND lower(brand) IN {brands:Array(String)}
        ${extra.sql}
      GROUP BY tran_date
      ORDER BY tran_date
    `,
    query_params: {
      ...extra.params,
      historyFrom: shiftYears(filters.from, -SALES_DASHBOARD_HISTORY_YEARS),
    },
    format: "JSONEachRow",
  });
  const rows = await result.json<{
    day: string;
    net: string | number;
    txns: string | number;
  }>();

  return rows.map((row) => ({
    day: row.day,
    net: toNumber(row.net),
    txns: toNumber(row.txns),
  }));
}

/** Per-store totals for the range and the same dates last year, in one scan. */
export async function getSalesStoreRows(
  filters: SalesDashboardFilters,
): Promise<SalesStoreRow[]> {
  const extra = filterClause(filters);
  const lyFrom = shiftYears(filters.from, -1);
  const lyTo = shiftYears(filters.to, -1);
  const result = await clickhouse.query({
    query: `
      SELECT location_name AS location, store_bi_name AS store,
             sumIf(tran_net * tran_sales_factor, tran_date >= {from:Date}) AS net,
             countIf(tran_sales_factor = 1 AND tran_date >= {from:Date}) AS txns,
             sumIf(tran_net * tran_sales_factor, tran_date <= {lyTo:Date}) AS ly_net,
             countIf(tran_sales_factor = 1 AND tran_date <= {lyTo:Date}) AS ly_txns
      FROM ${salesTransactionsTable()}
      WHERE (tran_date BETWEEN {from:Date} AND {to:Date}
             OR tran_date BETWEEN {lyFrom:Date} AND {lyTo:Date})
        AND lower(brand) IN {brands:Array(String)}
        ${extra.sql}
      GROUP BY location, store
      HAVING txns > 0
    `,
    query_params: { ...extra.params, lyFrom, lyTo },
    format: "JSONEachRow",
  });
  const rows = await result.json<{
    location: string;
    store: string;
    net: string | number;
    txns: string | number;
    ly_net: string | number;
    ly_txns: string | number;
  }>();

  return rows.map((row) => ({
    location: row.location.trim(),
    store: row.store.trim(),
    net: toNumber(row.net),
    txns: toNumber(row.txns),
    lyNet: toNumber(row.ly_net),
    lyTxns: toNumber(row.ly_txns),
  }));
}

/**
 * Filter options for the selected brands and date window only, so the
 * dropdowns never list another brand's stores or divisions.
 */
export async function getSalesDashboardOptions(
  filters: SalesDashboardFilters,
): Promise<{
  locations: SalesLocationOption[];
  divisions: SalesDivisionOption[];
  channels: string[];
}> {
  const params = { from: filters.from, to: filters.to, brands: filters.brands };
  const where = `
      FROM ${salesTransactionsTable()}
      WHERE tran_date BETWEEN {from:Date} AND {to:Date}
        AND lower(brand) IN {brands:Array(String)}
        AND tran_sales_factor = 1`;

  const [locationResult, divisionResult, channelResult] = await Promise.all([
    clickhouse.query({
      query: `
        SELECT tran_location AS id, anyLast(location_name) AS name
        ${where}
        GROUP BY id
        ORDER BY name`,
      query_params: params,
      format: "JSONEachRow",
    }),
    clickhouse.query({
      query: `
        SELECT DISTINCT dim_division_group_name AS division_group,
               division_name AS division
        ${where}
        ORDER BY division_group, division`,
      query_params: params,
      format: "JSONEachRow",
    }),
    clickhouse.query({
      query: `
        SELECT DISTINCT trim(dim_division_group_channel) AS channel
        ${where}
        ORDER BY channel`,
      query_params: params,
      format: "JSONEachRow",
    }),
  ]);

  const locations = await locationResult.json<{
    id: string | number;
    name: string;
  }>();
  const divisions = await divisionResult.json<{
    division_group: string;
    division: string;
  }>();

  return {
    locations: locations.map((row) => ({
      id: toNumber(row.id),
      name: row.name.trim() || `Location ${row.id}`,
    })),
    divisions: divisions
      .filter((row) => row.division.trim().length > 0)
      .map((row) => ({ group: row.division_group, division: row.division })),
    channels: (await channelResult.json<{ channel: string }>())
      .map((row) => row.channel)
      .filter((channel) => channel.trim().length > 0),
  };
}
