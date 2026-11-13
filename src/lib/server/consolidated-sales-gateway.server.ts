import {
  getConsolidatedSalesGateway,
  setConsolidatedSalesGateway,
  type ConsolidatedSalesGateway,
  type ConsolidatedSalesQuery,
} from "$lib/server/mastra/tools/consolidated-sales-gateway";
import { gatewayFailure } from "$lib/server/mastra/tools/forecast-gateway";
import { buildConsolidatedReport } from "$lib/services/sales-consolidated";
import {
  getConsolidatedOptions,
  getConsolidatedRows,
} from "$lib/services/sales-consolidated.server";
import {
  resolveSalesDashboardFilters,
  type SalesDashboardFilters,
} from "$lib/services/sales-dashboard";
import { getLatestSalesDay } from "$lib/services/sales-dashboard.server";

/**
 * SvelteKit-side implementation of the consolidated-sales assistant gateway
 * (src/lib/server/mastra/tools/consolidated-sales-gateway.ts). Wraps the page
 * services; installed once from src/hooks.server.ts.
 */

/** Same filters object +page.server.ts builds from the URL, from tool input. */
async function resolveFilters(
  query: ConsolidatedSalesQuery,
): Promise<SalesDashboardFilters> {
  const params = new URLSearchParams();
  if (query.brands.length > 0) params.set("brands", query.brands.join(","));
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.channels.length > 0)
    params.set("channels", query.channels.join(","));
  // The latest loaded day only matters when a date is missing (page default).
  const latestDay =
    query.from && query.to
      ? query.to
      : await getLatestSalesDay(query.scopeBrands);
  return resolveSalesDashboardFilters(params, query.scopeBrands, latestDay);
}

function failure(error: unknown) {
  return gatewayFailure<never>(
    "QUERY_FAILED",
    `The sales warehouse query failed: ${error instanceof Error ? error.message : String(error)}`,
    { retryable: true },
  );
}

export function createConsolidatedSalesGateway(): ConsolidatedSalesGateway {
  return {
    getOptions: async (query) => {
      try {
        const filters = await resolveFilters(query);
        const options = await getConsolidatedOptions(filters);
        return {
          ok: true,
          value: {
            filters: {
              brands: filters.brands,
              from: filters.from,
              to: filters.to,
            },
            options,
          },
        };
      } catch (error) {
        return failure(error);
      }
    },
    getReport: async (query) => {
      try {
        const filters = await resolveFilters(query);
        const rows = await getConsolidatedRows(filters, {
          stores: query.stores,
          cities: query.cities,
          weekdays: query.weekdays,
        });
        return {
          ok: true,
          value: {
            filters: {
              brands: filters.brands,
              from: filters.from,
              to: filters.to,
            },
            report: buildConsolidatedReport(rows),
          },
        };
      } catch (error) {
        return failure(error);
      }
    },
  };
}

/** Idempotent: keeps an already-installed gateway (dev HMR, tests). */
export function installConsolidatedSalesGateway(): void {
  if (!getConsolidatedSalesGateway())
    setConsolidatedSalesGateway(createConsolidatedSalesGateway());
}
