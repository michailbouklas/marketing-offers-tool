import { clickhouse } from "$lib/server/clickhouse";
import { prisma } from "$lib/server/prisma";
import {
  salesTransactionsTable,
  toNumber,
} from "$lib/services/forecasts/forecast-series.server";
import {
  AGGREGATOR_CHANNEL,
  DELIVERY_CHANNELS,
  type DeliveryCampaign,
  type DeliveryDayRow,
  type DeliveryLocationRow,
} from "./sales-delivery";

/**
 * ClickHouse reads for /sales/delivery. Always every delivery channel: the
 * selected channel is applied in `buildDeliveryDashboard`, so no URL value
 * reaches SQL. No refund handling: `tran_sales_factor` is always 1 here.
 */

const WHERE = `
      WHERE tran_date BETWEEN {from:Date} AND {to:Date}
        AND lower(brand) IN {brands:Array(String)}
        AND trim(dim_division_group_channel) IN {channels:Array(String)}`;

export async function getDeliveryDayRows(
  brands: string[],
  from: string,
  to: string,
): Promise<DeliveryDayRow[]> {
  const result = await clickhouse.query({
    query: `
      SELECT toString(tran_date) AS day,
             trim(dim_division_group_channel) AS channel,
             sum(tran_net) AS net,
             sum(tran_gross) AS gross,
             sum(tran_discount) AS discount,
             count() AS orders
      FROM ${salesTransactionsTable()}
      ${WHERE}
      GROUP BY day, channel
      ORDER BY day`,
    query_params: { from, to, brands, channels: DELIVERY_CHANNELS },
    format: "JSONEachRow",
  });
  const rows = await result.json<Record<string, string | number>>();

  return rows.map((row) => ({
    day: String(row.day),
    channel: String(row.channel),
    net: toNumber(row.net),
    gross: toNumber(row.gross),
    discount: toNumber(row.discount),
    orders: toNumber(row.orders),
  }));
}

export async function getDeliveryLocationRows(
  brands: string[],
  from: string,
  to: string,
): Promise<DeliveryLocationRow[]> {
  const result = await clickhouse.query({
    query: `
      SELECT trim(location_name) AS location,
             trim(dim_division_group_channel) AS channel,
             sum(tran_net) AS net,
             count() AS orders
      FROM ${salesTransactionsTable()}
      ${WHERE}
      GROUP BY location, channel`,
    query_params: { from, to, brands, channels: DELIVERY_CHANNELS },
    format: "JSONEachRow",
  });
  const rows = await result.json<Record<string, string | number>>();

  return rows.map((row) => ({
    location: String(row.location) || "Unknown location",
    channel: String(row.channel),
    net: toNumber(row.net),
    orders: toNumber(row.orders),
  }));
}

/** Net per delivery channel in the range, biggest first (drives the channel buttons). */
export async function getDeliveryChannelTotals(
  brands: string[],
  from: string,
  to: string,
): Promise<{ channel: string; net: number }[]> {
  const result = await clickhouse.query({
    query: `
      SELECT trim(dim_division_group_channel) AS channel, sum(tran_net) AS net
      FROM ${salesTransactionsTable()}
      ${WHERE}
      GROUP BY channel
      ORDER BY net DESC`,
    query_params: { from, to, brands, channels: DELIVERY_CHANNELS },
    format: "JSONEachRow",
  });
  const rows = await result.json<{ channel: string; net: string | number }>();
  return rows.map((row) => ({ channel: row.channel, net: toNumber(row.net) }));
}

/** Registered aggregator offers of the brand whose window overlaps the range. */
export async function getDeliveryCampaigns(
  brand: string,
  from: string,
  to: string,
): Promise<DeliveryCampaign[]> {
  const rows = await prisma.aggregator_offers.findMany({
    where: {
      brand: { alias: { equals: brand, mode: "insensitive" } },
      novasero_item_code: { not: "" },
      starts_at: { lte: new Date(`${to}T23:59:59Z`) },
      ends_at: { gte: new Date(`${from}T00:00:00Z`) },
    },
    select: {
      name: true,
      novasero_item_code: true,
      aggregator: true,
      starts_at: true,
      ends_at: true,
    },
  });
  // A few rows hold several codes ("A, B"), and the registry has duplicate
  // rows (same offer registered twice), so dedupe on everything shown.
  const unique = new Map<string, DeliveryCampaign>();
  for (const row of rows) {
    for (const code of row.novasero_item_code.split(/[,\s]+/).filter(Boolean)) {
      const campaign = {
        code,
        channel: AGGREGATOR_CHANNEL[row.aggregator],
        name: row.name,
        startsAt: row.starts_at.toISOString().slice(0, 10),
        endsAt: row.ends_at.toISOString().slice(0, 10),
      };
      unique.set(Object.values(campaign).join("|"), campaign);
    }
  }
  return [...unique.values()];
}
