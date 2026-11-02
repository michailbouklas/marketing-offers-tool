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
  type SalesDashboardBrand,
  type SalesDashboardFilters,
  type SalesDayBrandRow,
  type SalesDivisionOption,
  type SalesLocationOption,
} from "./sales-dashboard";

/**
 * Server-only ClickHouse reads for /sales/dashboard. Sales rows only
 * (`tran_sales_factor = 1`), revenue = `tran_net`, and every query is bound
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
async function getLatestSalesDay(brands: string[]): Promise<string> {
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

function filterClause(filters: SalesDashboardFilters) {
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

  return { sql: clauses.join("\n        "), params };
}

export async function getSalesDayBrandRows(
  filters: SalesDashboardFilters,
): Promise<SalesDayBrandRow[]> {
  const extra = filterClause(filters);
  const result = await clickhouse.query({
    query: `
      SELECT toString(tran_date) AS day, lower(brand) AS brand_code,
             sum(tran_net) AS net, count() AS txns
      FROM ${salesTransactionsTable()}
      WHERE tran_date BETWEEN {from:Date} AND {to:Date}
        AND lower(brand) IN {brands:Array(String)}
        AND tran_sales_factor = 1
        ${extra.sql}
      GROUP BY day, brand_code
      ORDER BY day, brand_code
    `,
    query_params: extra.params,
    format: "JSONEachRow",
  });
  const rows = await result.json<{
    day: string;
    brand_code: string;
    net: string | number;
    txns: string | number;
  }>();

  return rows.map((row) => ({
    day: row.day,
    brand: row.brand_code,
    net: toNumber(row.net),
    txns: toNumber(row.txns),
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
}> {
  const params = { from: filters.from, to: filters.to, brands: filters.brands };
  const where = `
      FROM ${salesTransactionsTable()}
      WHERE tran_date BETWEEN {from:Date} AND {to:Date}
        AND lower(brand) IN {brands:Array(String)}
        AND tran_sales_factor = 1`;

  const [locationResult, divisionResult] = await Promise.all([
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
  };
}
