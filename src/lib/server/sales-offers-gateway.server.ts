import type { GatewayOutcome } from "$lib/server/mastra/tools/forecast-gateway";
import {
  getSalesOffersGateway,
  setSalesOffersGateway,
  type OfferFilters,
  type OfferValuesResult,
  type SalesOffersGateway,
} from "$lib/server/mastra/tools/sales-offers-gateway";
import {
  compareWinner,
  offerCompareMetrics,
  offerReason,
  offerWeeks,
  weekdayMix,
} from "$lib/services/sales-offers";
import {
  getCachedOfferValues,
  getOfferCalendarRows,
  getOfferDailyRows,
  getOfferFilterOptions,
  getOfferSlotSales,
  getOfferValuesForRange,
  type CachedOfferValues,
} from "$lib/services/sales-offers.server";

/**
 * SvelteKit-side implementation of the sales-offers assistant gateway
 * (src/lib/server/mastra/tools/sales-offers-gateway.ts). Wraps the same
 * services and pure helpers as /sales/offers so the assistant's numbers equal
 * the page's; installed once from src/hooks.server.ts.
 */

async function attempt<T>(task: () => Promise<T>): Promise<GatewayOutcome<T>> {
  try {
    return { ok: true, value: await task() };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`[sales-offers-gateway] ${message}`);
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message:
          "The offer figures could not be loaded. Try again in a moment.",
        retryable: true,
      },
    };
  }
}

const toResult = (
  values: CachedOfferValues,
  source: OfferValuesResult["source"],
): OfferValuesResult => ({
  source,
  offers: values.offers,
  computedAt: values.computedAt.toISOString(),
  idealFcPerc: values.idealFcPerc,
});

/** Same rule as +page.server.ts: no filter = cache; never a live all-time scan. */
async function offerValues(
  brand: string,
  { range, channels, locations }: OfferFilters,
): Promise<OfferValuesResult | null> {
  if (!range && channels.length === 0 && locations.length === 0) {
    const cached = await getCachedOfferValues(brand);
    return cached ? toResult(cached, "cache") : null;
  }
  if (!range) throw new Error("A date range is required for live offer values");
  return toResult(
    await getOfferValuesForRange(brand, range, channels, locations),
    "live",
  );
}

export function createSalesOffersGateway(): SalesOffersGateway {
  return {
    listFilterOptions: (brand, range) =>
      attempt(() =>
        getOfferFilterOptions(
          {
            brands: [brand],
            from: range?.from ?? new Date().toISOString().slice(0, 10),
            to: range?.to ?? new Date().toISOString().slice(0, 10),
            locationId: null,
            divisionGroup: null,
            divisionName: null,
            channels: [],
          },
          range,
        ),
      ),

    getCachedOfferValues: (brand) =>
      attempt(async () => {
        const cached = await getCachedOfferValues(brand);
        return cached ? toResult(cached, "cache") : null;
      }),

    getLiveOfferValues: (brand, { range, channels, locations }) =>
      attempt(async () =>
        toResult(
          await getOfferValuesForRange(brand, range, channels, locations),
          "live",
        ),
      ),

    compareOffers: (brand, codes, filters) =>
      attempt(async () => {
        const values = await offerValues(brand, filters);
        if (!values) return null;
        const found = codes
          .map((code) => values.offers.find((offer) => offer.code === code))
          .filter((offer) => offer !== undefined);
        const daily = found.length
          ? await getOfferDailyRows(
              brand,
              found.map((offer) => offer.code),
              filters.range,
              filters.channels,
              filters.locations,
            )
          : [];
        return {
          source: values.source,
          computedAt: values.computedAt,
          idealFcPerc: values.idealFcPerc,
          offers: found.map((offer) => ({
            value: offer,
            reason: offerReason(offer, values.idealFcPerc),
            weekdayMix: weekdayMix(daily, offer.code),
            weeks: offerWeeks(daily, offer.code),
          })),
          missing: codes.filter(
            (code) => !found.some((offer) => offer.code === code),
          ),
          metrics:
            found.length === 2
              ? offerCompareMetrics(found[0], found[1]).map((metric) => ({
                  ...metric,
                  winner: compareWinner(metric),
                }))
              : null,
        };
      }),

    getOfferCalendarRows: (brand, { range, channels, locations }) =>
      attempt(() => getOfferCalendarRows(brand, range, channels, locations)),

    getOfferSlotSales: (brand, { range, channels, locations }, slot) =>
      attempt(() => getOfferSlotSales(brand, range, channels, slot, locations)),
  };
}

/** Idempotent: keeps an already-installed gateway (dev HMR, tests). */
export function installSalesOffersGateway(): void {
  if (!getSalesOffersGateway())
    setSalesOffersGateway(createSalesOffersGateway());
}
