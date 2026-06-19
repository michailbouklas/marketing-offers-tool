import { clickhouse } from "$lib/server/clickhouse";
import { competitionTable, parseCount } from "$lib/server/competition-db";
import type {
  ActiveOffersByAggregatorSeries,
  ActiveOffersByAggregatorTimeSeries,
} from "$lib/services/competition/competition";

type ActiveOffersByAggregatorRow = {
  day: string;
  aggregator_id: number;
  aggregator_name?: string | null;
  offer_count: string | number;
};

const ACTIVE_OFFERS_WINDOW_DAYS = 45;
const UTC_DAY_LENGTH_MS = 24 * 60 * 60 * 1000;

function toUtcDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getLastUtcDayKeys(dayCount: number, now = new Date()) {
  if (!Number.isInteger(dayCount) || dayCount <= 0) {
    throw new Error("Day count must be a positive integer.");
  }

  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const firstDayUtc = todayUtc - (dayCount - 1) * UTC_DAY_LENGTH_MS;

  return Array.from({ length: dayCount }, (_, index) =>
    toUtcDayKey(new Date(firstDayUtc + index * UTC_DAY_LENGTH_MS)),
  );
}

function buildSeries(
  totalsByAggregator: Map<number, { label: string; total: number }>,
): ActiveOffersByAggregatorSeries[] {
  return [...totalsByAggregator.entries()]
    .sort(
      (a, b) => b[1].total - a[1].total || a[1].label.localeCompare(b[1].label),
    )
    .map(([aggregatorId, item], index) => ({
      key: `aggregator-${index}`,
      aggregatorId,
      label: item.label,
    }));
}

export async function getActiveOffersByDayByAggregator(): Promise<ActiveOffersByAggregatorTimeSeries> {
  const days = getLastUtcDayKeys(ACTIVE_OFFERS_WINDOW_DAYS);
  const firstDay = days[0];
  const lastDay = days.at(-1);

  if (!firstDay || !lastDay) {
    return { series: [], points: [] };
  }

  const rows = await clickhouse
    .query({
      query: `
        SELECT
          toString(days.day) AS day,
          r.aggregator_id AS aggregator_id,
          any(coalesce(nullIf(a.display_name, ''), a.name)) AS aggregator_name,
          count() AS offer_count
        FROM ${competitionTable("offer")} AS o FINAL
        CROSS JOIN (
          WITH
            toDate({start_day:String}) AS start_day,
            toDate({end_day:String}) AS end_day
          SELECT arrayJoin(arrayMap(i -> start_day + i, range(dateDiff('day', start_day, end_day) + 1))) AS day
        ) AS days
        INNER JOIN ${competitionTable("restaurant")} AS r FINAL ON r.id = o.restaurant_id
        LEFT JOIN ${competitionTable("aggregator")} AS a FINAL ON a.id = r.aggregator_id
        WHERE toDate(o.first_seen_at) <= days.day
          AND (o.is_active = 1 OR toDate(o.last_seen_at) >= days.day)
        GROUP BY days.day, r.aggregator_id
        ORDER BY days.day ASC, r.aggregator_id ASC
      `,
      query_params: {
        start_day: firstDay,
        end_day: lastDay,
      },
      format: "JSONEachRow",
    })
    .then((result) => result.json<ActiveOffersByAggregatorRow>());

  if (rows.length === 0) {
    return { series: [], points: [] };
  }

  const totalsByAggregator = new Map<
    number,
    { label: string; total: number }
  >();
  const countsByDayAndAggregator = new Map<string, Map<number, number>>();

  for (const row of rows) {
    const offerCount = parseCount(row.offer_count);
    const label = row.aggregator_name || `Aggregator #${row.aggregator_id}`;
    const total = totalsByAggregator.get(row.aggregator_id)?.total ?? 0;
    totalsByAggregator.set(row.aggregator_id, {
      label,
      total: total + offerCount,
    });

    let dayCounts = countsByDayAndAggregator.get(row.day);
    if (!dayCounts) {
      dayCounts = new Map();
      countsByDayAndAggregator.set(row.day, dayCounts);
    }
    dayCounts.set(row.aggregator_id, offerCount);
  }

  const series = buildSeries(totalsByAggregator);

  const points = days.map((date) => {
    const dayCounts = countsByDayAndAggregator.get(date);
    const counts: Record<string, number> = {};

    for (const item of series) {
      counts[item.key] = dayCounts?.get(item.aggregatorId) ?? 0;
    }

    return { date, counts };
  });

  return { series, points };
}
