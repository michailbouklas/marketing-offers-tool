import type { ActiveOffersByAggregatorTimeSeries } from "$lib/services/competition/competition";
import { z } from "zod";

const ACTIVE_OFFERS_BY_DAY_ENDPOINT =
  "/api/competition/active-offers-by-day-by-aggregator";

const activeOffersByAggregatorTimeSeriesSchema = z.object({
  series: z.array(
    z.object({
      key: z.string().min(1),
      aggregatorId: z.number().int(),
      label: z.string().min(1),
    }),
  ),
  points: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      counts: z.record(z.string(), z.number().int().nonnegative()),
    }),
  ),
});

export async function fetchActiveOffersByDayByAggregator(
  fetchFn: typeof fetch = fetch,
): Promise<ActiveOffersByAggregatorTimeSeries> {
  const response = await fetchFn(ACTIVE_OFFERS_BY_DAY_ENDPOINT);

  if (!response.ok) {
    throw new Error("Unable to load active offers by day.");
  }

  const result = activeOffersByAggregatorTimeSeriesSchema.safeParse(
    await response.json(),
  );

  if (!result.success) {
    throw new Error("Received an invalid active offers by day response.");
  }

  return result.data;
}
