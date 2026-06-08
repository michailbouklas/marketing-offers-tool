import { clickhouse } from "$lib/server/clickhouse";
import {
  competitionTable,
  getCompetitionCurrency,
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
  snapshot_active?: number | null;
  price?: string | number | null;
  effective_at_iso: string;
};

const RECENT_CHANGES_LIMIT = 20;

export async function getDashboardStats(): Promise<DashboardStats> {
  const [totalsRows, processorRows, recentRows] = await Promise.all([
    clickhouse
      .query({
        query: `
          SELECT
            (SELECT count() FROM ${competitionTable("restaurant")} FINAL) AS total_restaurants,
            (SELECT count() FROM ${competitionTable("product")} FINAL) AS total_products,
            (SELECT count() FROM ${competitionTable("offer")} FINAL) AS total_offers,
            (
              SELECT count()
              FROM ${competitionTable("offer")} FINAL
              WHERE is_active = 1
            ) AS active_offers
        `,
        format: "JSONEachRow",
      })
      .then((result) => result.json<TotalsRow>()),
    clickhouse
      .query({
        query: `
          SELECT
            r.aggregator_id AS processor_id,
            any(coalesce(nullIf(a.display_name, ''), a.name)) AS processor_name,
            count() AS active_offers,
            uniqExact(o.restaurant_id) AS restaurants_with_offers
          FROM ${competitionTable("offer")} AS o FINAL
          INNER JOIN ${competitionTable("restaurant")} AS r FINAL ON r.id = o.restaurant_id
          LEFT JOIN ${competitionTable("aggregator")} AS a FINAL ON a.id = r.aggregator_id
          WHERE o.is_active = 1
          GROUP BY r.aggregator_id
          ORDER BY active_offers DESC
        `,
        format: "JSONEachRow",
      })
      .then((result) => result.json<ProcessorStatsRow>()),
    clickhouse
      .query({
        query: `
          SELECT
            os.offer_id AS offer_id,
            o.title AS offer_name,
            o.restaurant_id AS restaurant_id,
            r.name AS restaurant_name,
            coalesce(nullIf(a.display_name, ''), a.name) AS processor_name,
            os.is_active AS snapshot_active,
            pp.price AS price,
            ${utcIsoExpression("os.recorded_at")} AS effective_at_iso
          FROM ${competitionTable("offer_snapshot")} AS os FINAL
          LEFT JOIN ${competitionTable("offer")} AS o FINAL ON o.id = os.offer_id
          LEFT JOIN ${competitionTable("restaurant")} AS r FINAL ON r.id = o.restaurant_id
          LEFT JOIN ${competitionTable("aggregator")} AS a FINAL ON a.id = r.aggregator_id
          LEFT JOIN ${competitionTable("product_price")} AS pp FINAL
            ON pp.product_id = os.product_id AND pp.session_id = os.session_id
          ORDER BY os.recorded_at DESC
          LIMIT {limit:UInt32}
        `,
        query_params: {
          limit: RECENT_CHANGES_LIMIT,
        },
        format: "JSONEachRow",
      })
      .then((result) => result.json<RecentChangeRow>()),
  ]);

  const currency = getCompetitionCurrency();

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
    status: row.snapshot_active === 1 ? "active" : "inactive",
    price: parseNullableNumber(row.price),
    currency,
    effectiveAt: row.effective_at_iso,
  }));

  return {
    totals,
    activeOffersByProcessor,
    recentChanges,
  };
}
