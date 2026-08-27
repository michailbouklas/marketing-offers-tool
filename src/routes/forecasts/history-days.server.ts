import { isForecastError } from "$lib/services/forecasts/forecast-engine.server";
import { getSalesHistorySummary } from "$lib/services/forecasts/forecast-series.server";

/**
 * Days of usable sales history for the controls bar ("model needs N days").
 * `0` = the brand has no sales data; `null` = unknown (no brand selected or
 * the warehouse query failed — the page still renders, the browser-side
 * history fetch fills the gap).
 */
export async function loadHistoryDays(
  brandAlias: string | null | undefined,
): Promise<number | null> {
  if (!brandAlias) {
    return null;
  }
  try {
    const summary = await getSalesHistorySummary(brandAlias, { recentDays: 0 });
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
