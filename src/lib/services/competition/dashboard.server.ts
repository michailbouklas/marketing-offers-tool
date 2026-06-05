import { clickhouse } from "$lib/server/clickhouse";
import {
  competitionTable,
  parseCount,
  parseNullableNumber,
  utcIsoExpression,
} from "$lib/server/competition-db";
import type {
  DashboardStats,
  ProcessorOfferStats,
  RecentOfferChange,
} from "$lib/services/competition/competition";

type TotalsRow = {
  total_restaurants: string | number;
  total_products: string | number;
  total_offers: string | number;
  active_offers: string | number;
};

type ProcessorStatsRow = {
  processor_id: number;
  processor_name?: string | null;
  active_offers: string | number;
  restaurants_with_offers: string | number;
};

type RecentChangeRow = {
  offer_id: number;
  offer_name?: string | null;
  restaurant_id?: number | null;
  restaurant_name?: string | null;
  processor_name?: string | null;
  status: string;
  discount_value?: string | number | null;
  resulting_price?: string | number | null;
  effective_at_iso: string;
};

const RECENT_CHANGES_LIMIT = 20;

export async function getDashboardStats(): Promise<DashboardStats> {
  const [totalsRows, processorRows, recentRows] = await Promise.all([
    clickhouse
      .query({
        query: `
          SELECT
            (SELECT count() FROM ${competitionTable("restaurants")} FINAL) AS total_restaurants,
            (SELECT count() FROM ${competitionTable("products")} FINAL) AS total_products,
            (SELECT count() FROM ${competitionTable("offers")} FINAL) AS total_offers,
            (
              SELECT count()
              FROM ${competitionTable("offers")} FINAL
              WHERE active = 1 AND cancelled_at IS NULL
            ) AS active_offers
        `,
        format: "JSONEachRow",
      })
      .then((result) => result.json<TotalsRow>()),
    clickhouse
      .query({
        query: `
          SELECT
            o.processor_id AS processor_id,
            any(p.name) AS processor_name,
            count() AS active_offers,
            uniqExact(o.restaurant_id) AS restaurants_with_offers
          FROM ${competitionTable("offers")} AS o FINAL
          LEFT JOIN ${competitionTable("processors")} AS p FINAL ON p.id = o.processor_id
          WHERE o.active = 1 AND o.cancelled_at IS NULL
          GROUP BY o.processor_id
          ORDER BY active_offers DESC
        `,
        format: "JSONEachRow",
      })
      .then((result) => result.json<ProcessorStatsRow>()),
    clickhouse
      .query({
        query: `
          SELECT
            ots.offer_id AS offer_id,
            o.name AS offer_name,
            o.restaurant_id AS restaurant_id,
            r.name AS restaurant_name,
            p.name AS processor_name,
            ots.status AS status,
            ots.discount_value AS discount_value,
            ots.resulting_price AS resulting_price,
            ${utcIsoExpression("ots.effective_at")} AS effective_at_iso
          FROM ${competitionTable("offer_time_series")} AS ots FINAL
          LEFT JOIN ${competitionTable("offers")} AS o FINAL ON o.id = ots.offer_id
          LEFT JOIN ${competitionTable("restaurants")} AS r FINAL ON r.id = o.restaurant_id
          LEFT JOIN ${competitionTable("processors")} AS p FINAL ON p.id = o.processor_id
          ORDER BY ots.effective_at DESC
          LIMIT {limit:UInt32}
        `,
        query_params: {
          limit: RECENT_CHANGES_LIMIT,
        },
        format: "JSONEachRow",
      })
      .then((result) => result.json<RecentChangeRow>()),
  ]);

  const totalsRow = totalsRows[0];
  const totals = {
    restaurants: parseCount(totalsRow?.total_restaurants),
    products: parseCount(totalsRow?.total_products),
    offers: parseCount(totalsRow?.total_offers),
    activeOffers: parseCount(totalsRow?.active_offers),
  };

  const activeOffersByProcessor = processorRows.map<ProcessorOfferStats>(
    (row) => ({
      processorId: row.processor_id,
      processorName: row.processor_name || `Processor #${row.processor_id}`,
      activeOffers: parseCount(row.active_offers),
      restaurantsWithOffers: parseCount(row.restaurants_with_offers),
    }),
  );

  const recentChanges = recentRows.map<RecentOfferChange>((row) => ({
    offerId: row.offer_id,
    offerName: row.offer_name ?? null,
    restaurantId: row.restaurant_id ?? null,
    restaurantName: row.restaurant_name ?? null,
    processorName: row.processor_name ?? null,
    status: row.status,
    discountValue: parseNullableNumber(row.discount_value),
    resultingPrice: parseNullableNumber(row.resulting_price),
    effectiveAt: row.effective_at_iso,
  }));

  return {
    totals,
    activeOffersByProcessor,
    recentChanges,
  };
}
