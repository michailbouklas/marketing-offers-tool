import { clickhouse } from "$lib/server/clickhouse";
import {
  salesTransactionsTable,
  toNumber,
} from "$lib/services/forecasts/forecast-series.server";
import type {
  ConsolidatedExtras,
  ConsolidatedRow,
  ConsolidatedStoreOption,
} from "./sales-consolidated";
import type { SalesDashboardFilters } from "./sales-dashboard";
import { filterClause } from "./sales-dashboard.server";

/**
 * ClickHouse reads for /sales/consolidated-sales-report. Brand scope, dates
 * and channels come from the sales dashboard filters (`filterClause`). City
 * and the company display name live only in `apidata_replica.dim_store`
 * (joined on `BI Name` = `store_bi_name`). dim_store is CDC-replicated and has
 * duplicate store rows, so it is always read collapsed to one row per store.
 */

export const STORE_DIM = `
  SELECT assumeNotNull(\`BI Name\`) AS store,
         ifNull(any(\`SAP CompanyName\`), '') AS company_label,
         ifNull(any(district), '') AS city
  FROM apidata_replica.dim_store FINAL
  WHERE _sign = 1 AND \`BI Name\` IS NOT NULL
  GROUP BY store`;

/** Per-store Trans / Gross / Discount / Net with company and city labels. */
export async function getConsolidatedRows(
  filters: SalesDashboardFilters,
  extras: ConsolidatedExtras,
): Promise<ConsolidatedRow[]> {
  const extra = filterClause(filters);
  const clauses = [extra.sql];
  if (extras.stores.length > 0) {
    clauses.push("AND store_bi_name IN {stores:Array(String)}");
  }
  if (extras.cities.length > 0) {
    clauses.push(
      "AND store_bi_name IN (SELECT store FROM (" +
        STORE_DIM +
        ") WHERE city IN {cities:Array(String)})",
    );
  }
  if (extras.weekdays.length > 0) {
    clauses.push("AND toDayOfWeek(tran_date) IN {weekdays:Array(UInt8)}");
  }

  const result = await clickhouse.query({
    query: `
      SELECT t.company AS company, t.store AS store, t.location AS location,
             t.trans AS trans, t.gross AS gross, t.discount AS discount,
             t.net AS net, d.company_label AS company_label, d.city AS city
      FROM (
        SELECT store_company AS company, store_bi_name AS store,
               any(location_name) AS location,
               countIf(tran_sales_factor = 1) AS trans,
               sum(tran_gross * tran_sales_factor) AS gross,
               sum(tran_discount * tran_sales_factor) AS discount,
               sum(tran_net * tran_sales_factor) AS net
        FROM ${salesTransactionsTable()}
        WHERE tran_date BETWEEN {from:Date} AND {to:Date}
          AND lower(brand) IN {brands:Array(String)}
          ${clauses.join("\n          ")}
        GROUP BY company, store
        HAVING trans > 0
      ) AS t
      LEFT JOIN (${STORE_DIM}) AS d ON d.store = t.store
    `,
    query_params: { ...extra.params, ...extras },
    format: "JSONEachRow",
  });
  const rows = await result.json<{
    company: string;
    store: string;
    location: string;
    trans: string | number;
    gross: string | number;
    discount: string | number;
    net: string | number;
    company_label: string;
    city: string;
  }>();

  return rows.map((row) => {
    const company = row.company.trim() || "UNASSIGNED";
    return {
      company,
      companyLabel: row.company_label.trim() || company,
      store: row.store.trim(),
      location: row.location.trim() || row.store.trim(),
      city: row.city.trim(),
      trans: toNumber(row.trans),
      gross: toNumber(row.gross),
      discount: toNumber(row.discount),
      net: toNumber(row.net),
    };
  });
}

/** Filter options for the selected brands and date window only. */
export async function getConsolidatedOptions(
  filters: SalesDashboardFilters,
): Promise<{
  channels: string[];
  stores: ConsolidatedStoreOption[];
  cities: string[];
}> {
  const params = { from: filters.from, to: filters.to, brands: filters.brands };
  const where = `
      FROM ${salesTransactionsTable()}
      WHERE tran_date BETWEEN {from:Date} AND {to:Date}
        AND lower(brand) IN {brands:Array(String)}
        AND tran_sales_factor = 1`;

  const [channelResult, storeResult] = await Promise.all([
    clickhouse.query({
      query: `SELECT DISTINCT trim(dim_division_group_channel) AS channel ${where} ORDER BY channel`,
      query_params: params,
      format: "JSONEachRow",
    }),
    clickhouse.query({
      query: `
        SELECT s.store AS store, s.location AS location, d.city AS city
        FROM (
          SELECT store_bi_name AS store, any(location_name) AS location
          ${where}
          GROUP BY store
        ) AS s
        LEFT JOIN (${STORE_DIM}) AS d ON d.store = s.store
        ORDER BY location`,
      query_params: params,
      format: "JSONEachRow",
    }),
  ]);

  const stores = (
    await storeResult.json<{ store: string; location: string; city: string }>()
  )
    .filter((row) => row.store.trim().length > 0)
    .map((row) => ({
      store: row.store.trim(),
      location: row.location.trim() || row.store.trim(),
      city: row.city.trim(),
    }));

  return {
    channels: (await channelResult.json<{ channel: string }>())
      .map((row) => row.channel)
      .filter((channel) => channel.trim().length > 0),
    stores,
    cities: [
      ...new Set(stores.map((row) => row.city).filter((city) => city)),
    ].sort(),
  };
}
