import { isForecastError } from "$lib/services/forecasts/forecast-engine.server";
import type { ForecastPageContext } from "$lib/services/forecasts/forecast-scope.server";
import {
  getSalesHistorySummary,
  listBrandLocations,
} from "$lib/services/forecasts/forecast-series.server";
import type {
  ForecastFilters,
  ForecastLocation,
} from "$lib/services/forecasts/forecast-types";

/**
 * Per-page data shared by the overview, compare and deep-dive loads once the
 * brand scope is resolved: the brand's locations (populate the location
 * combobox), the URL `location` filter validated against them, and the days
 * of usable sales history for the selected brand/location.
 */
export type ForecastPageData = {
  filters: ForecastFilters;
  /** Locations of the selected brand; empty until a brand is selected. */
  locations: ForecastLocation[];
  /**
   * Days of usable sales history for the controls bar ("model needs N days").
   * `0` = no sales data; `null` = unknown (no brand, or the warehouse query
   * failed — the page still renders and the browser-side history fetch fills
   * the gap).
   */
  historyDays: number | null;
};

export async function loadLocations(
  brandAlias: string | null | undefined,
): Promise<ForecastLocation[]> {
  if (!brandAlias) {
    return [];
  }
  try {
    return await listBrandLocations(brandAlias);
  } catch (err) {
    console.error(
      "[forecasts] location list failed:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export async function loadHistoryDays(
  brandAlias: string | null | undefined,
  locationId: number | null = null,
): Promise<number | null> {
  if (!brandAlias) {
    return null;
  }
  try {
    const summary = await getSalesHistorySummary(brandAlias, {
      recentDays: 0,
      locationId,
    });
    return summary?.historyDays ?? 0;
  } catch (err) {
    if (isForecastError(err) && err.code === "NO_SALES_DATA") {
      return 0;
    }
    console.error(
      "[forecasts] sales history summary failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * A `location` from the URL is only honoured when it is one of the brand's
 * locations; anything else falls back to "all locations" so a stale or
 * hand-edited link never silently forecasts nothing.
 */
export function normaliseLocationFilter(
  filters: ForecastFilters,
  locations: ForecastLocation[],
): ForecastFilters {
  if (filters.location === null) {
    return filters;
  }
  const known = locations.some((location) => location.id === filters.location);
  return known ? filters : { ...filters, location: null };
}

export async function loadForecastPageData(
  context: Pick<ForecastPageContext, "brand" | "filters">,
): Promise<ForecastPageData> {
  const locations = await loadLocations(context.brand?.alias);
  const filters = normaliseLocationFilter(context.filters, locations);
  const historyDays = await loadHistoryDays(
    context.brand?.alias,
    filters.location,
  );

  return { filters, locations, historyDays };
}
