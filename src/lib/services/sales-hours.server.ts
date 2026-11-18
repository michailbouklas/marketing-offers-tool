import { clickhouse } from "$lib/server/clickhouse";
import {
  salesTransactionsTable,
  toNumber,
} from "$lib/services/forecasts/forecast-series.server";
import { filterClause, STORE_DIM } from "$lib/services/sales-dashboard.server";
import type { SalesDashboardFilters } from "$lib/services/sales-dashboard";
import {
  BUSINESS_DAY_START_HOUR,
  type SalesChannelRow,
  type SalesDayCell,
  type SalesHourCell,
  type SalesMonthHourCell,
} from "$lib/services/sales-hours";

/**
 * Net and orders per weekday × hour for /sales/hours. Weekday is the POS
 * business day (`tran_date`), so after-midnight orders stay on the evening
 * they belong to. `trans_order_time` already holds Cyprus wall-clock time in a
 * UTC-labelled column (verified 2026-11-04 against `trde_recorded_time`), so it
 * is NOT converted with toTimeZone.
 */
export async function getSalesHourCells(
  filters: SalesDashboardFilters,
): Promise<SalesHourCell[]> {
  const extra = filterClause(filters);
  const result = await clickhouse.query({
    query: `
      SELECT toDayOfWeek(tran_date) AS weekday,
             toHour(trans_order_time) AS hour,
             sum(tran_net) AS net,
             count() AS txns
      FROM ${salesTransactionsTable()}
      WHERE tran_date BETWEEN {from:Date} AND {to:Date}
        AND lower(brand) IN {brands:Array(String)}
        AND tran_sales_factor = 1
        ${extra.sql}
      GROUP BY weekday, hour
    `,
    query_params: extra.params,
    format: "JSONEachRow",
  });
  const rows = await result.json<{
    weekday: number | string;
    hour: number | string;
    net: number | string;
    txns: number | string;
  }>();

  return rows.map((row) => ({
    weekday: toNumber(row.weekday),
    hour: toNumber(row.hour),
    net: toNumber(row.net),
    txns: toNumber(row.txns),
  }));
}

/** Date × hour × channel for the VS split; `buildChannelBreakdown` folds it into any view. */
export async function getSalesChannelRows(
  filters: SalesDashboardFilters,
): Promise<SalesChannelRow[]> {
  const extra = filterClause(filters);
  const result = await clickhouse.query({
    query: `
      SELECT toString(tran_date) AS day,
             toHour(trans_order_time) AS hour,
             trim(dim_division_group_channel) AS channel,
             sum(tran_net) AS net,
             count() AS txns
      FROM ${salesTransactionsTable()}
      WHERE tran_date BETWEEN {from:Date} AND {to:Date}
        AND lower(brand) IN {brands:Array(String)}
        AND tran_sales_factor = 1
        ${extra.sql}
      GROUP BY day, hour, channel
    `,
    query_params: extra.params,
    format: "JSONEachRow",
  });
  const rows = await result.json<{
    day: string;
    hour: number | string;
    channel: string;
    net: number | string;
    txns: number | string;
  }>();

  return rows
    .filter((row) => row.channel.length > 0)
    .map((row) => ({
      day: row.day,
      hour: toNumber(row.hour),
      channel: row.channel,
      net: toNumber(row.net),
      txns: toNumber(row.txns),
    }));
}

/**
 * Net and orders per brand × location × channel × month × hour for the all-brands export. Only the
 * date range applies; channel is a breakdown column, not a filter.
 * Hours sort in business-day order (05 … 04), like the page grid.
 */
export async function getSalesMonthHourCells(
  from: string,
  to: string,
  brands: string[],
): Promise<SalesMonthHourCell[]> {
  const result = await clickhouse.query({
    query: `
      SELECT c.brand AS brand, ifNull(d.city, '') AS city, c.location_id AS location_id,
             c.store AS store, c.location AS location, c.channel AS channel, c.month AS month, c.hour AS hour,
             c.net AS net, c.txns AS txns
      FROM (
        SELECT lower(brand) AS brand,
               tran_location AS location_id,
               anyLast(location_name) AS location,
               anyLast(store_bi_name) AS store,
               trim(dim_division_group_channel) AS channel,
               formatDateTime(tran_date, '%Y-%m') AS month,
               toHour(trans_order_time) AS hour,
               sum(tran_net) AS net,
               count() AS txns
        FROM ${salesTransactionsTable()}
        WHERE tran_date BETWEEN {from:Date} AND {to:Date}
          AND lower(brand) IN {brands:Array(String)}
          AND tran_sales_factor = 1
        GROUP BY brand, location_id, channel, month, hour
      ) AS c
      LEFT JOIN (${STORE_DIM}) AS d ON d.store = c.store
      ORDER BY brand, city, store, location, location_id, channel, month, (hour + 24 - {start:UInt8}) % 24
    `,
    query_params: { from, to, brands, start: BUSINESS_DAY_START_HOUR },
    format: "JSONEachRow",
  });
  const rows = await result.json<{
    brand: string;
    city: string;
    location_id: number | string;
    store: string;
    location: string;
    channel: string;
    month: string;
    hour: number | string;
    net: number | string;
    txns: number | string;
  }>();

  return rows.map((row) => ({
    brand: row.brand,
    city: row.city.trim(),
    store: row.store.trim(),
    location: row.location.trim() || `Location ${row.location_id}`,
    channel: row.channel,
    month: row.month,
    hour: toNumber(row.hour),
    net: toNumber(row.net),
    txns: toNumber(row.txns),
  }));
}

/** Net and orders per POS business day (`tran_date`) for the "By date" calendar. */
export async function getSalesDayTotals(
  filters: SalesDashboardFilters,
): Promise<SalesDayCell[]> {
  const extra = filterClause(filters);
  const result = await clickhouse.query({
    query: `
      SELECT toString(tran_date) AS day,
             sum(tran_net) AS net,
             count() AS txns
      FROM ${salesTransactionsTable()}
      WHERE tran_date BETWEEN {from:Date} AND {to:Date}
        AND lower(brand) IN {brands:Array(String)}
        AND tran_sales_factor = 1
        ${extra.sql}
      GROUP BY day
    `,
    query_params: extra.params,
    format: "JSONEachRow",
  });
  const rows = await result.json<{
    day: string;
    net: number | string;
    txns: number | string;
  }>();

  return rows.map((row) => ({
    day: row.day,
    net: toNumber(row.net),
    txns: toNumber(row.txns),
  }));
}
