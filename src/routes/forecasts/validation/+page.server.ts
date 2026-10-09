import { isAdminRole } from "$lib/auth/roles";
import { getAuthenticatedUserRole } from "$lib/server/auth-guards";
import { getForecastValidationEnv } from "$lib/server/env";
import { listForecastModels } from "$lib/services/forecasts/forecast-engine.server";
import { resolveForecastBrand } from "$lib/services/forecasts/forecast-scope.server";
import type { ForecastModel } from "$lib/services/forecasts/forecast-types";
import {
  groupValidationRuns,
  parseForecastValidationFilters,
  summarizeValidationRuns,
  validationMatrix,
} from "$lib/services/forecasts/forecast-validation";
import {
  listForecastValidationFacets,
  listForecastValidationMetricRows,
  listForecastValidationRuns,
} from "$lib/services/forecasts/forecast-validation-query.server";
import {
  getLastForecastValidationRecord,
  isForecastValidationEvaluateInFlight,
  isForecastValidationRecordInFlight,
} from "$lib/services/forecasts/forecast-validation.server";
import type { PageServerLoad } from "./$types";

/**
 * /forecasts/validation — recorded forecasts scored against actual sales.
 * Standalone page (`+page@.svelte`), so it resolves the brand scope itself
 * rather than relying on the /forecasts layout load. Everything is scoped
 * to the caller's brands; a `?brand=` outside the scope is dropped silently.
 */
export const load: PageServerLoad = async (event) => {
  const { brands } = await resolveForecastBrand(event, null, {
    guard: "page",
  });
  const role = await getAuthenticatedUserRole(event);
  const brandAliases = brands.map((brand) => brand.alias);

  const parsed = parseForecastValidationFilters(event.url.searchParams);
  const filters =
    parsed.brand !== null &&
    !brandAliases.some((alias) => alias.toLowerCase() === parsed.brand)
      ? { ...parsed, brand: null }
      : parsed;

  const [models, runsPage, metricRows, facets] = await Promise.all([
    listForecastModels().catch((err: unknown): ForecastModel[] => {
      console.error(
        "[forecasts] validation page: model catalog unavailable:",
        err instanceof Error ? err.message : err,
      );
      return [];
    }),
    listForecastValidationRuns({ brandAliases, filters }),
    listForecastValidationMetricRows({ brandAliases, filters }),
    listForecastValidationFacets({ brandAliases }),
  ]);

  // Models seen in the runs but missing from the (possibly unavailable)
  // catalog still need a name and a filter option.
  const modelOptions = [
    ...models.map((model) => ({ id: model.id, name: model.name })),
    ...facets.modelIds
      .filter((id) => !models.some((model) => model.id === id))
      .map((id) => ({ id, name: id })),
  ];

  const env = getForecastValidationEnv();

  return {
    brands,
    models,
    modelOptions,
    filters,
    runsPage,
    summary: summarizeValidationRuns(metricRows),
    groups: groupValidationRuns(metricRows, filters.group, modelOptions),
    matrix: validationMatrix(metricRows, modelOptions),
    facets,
    isAdmin: isAdminRole(role),
    inFlight: {
      record: isForecastValidationRecordInFlight(),
      evaluate: isForecastValidationEvaluateInFlight(),
    },
    lastRecord: getLastForecastValidationRecord(),
    validationEnv: {
      defaultDays: env.FORECAST_VALIDATION_DEFAULT_DAYS,
      cron: env.FORECAST_VALIDATION_CRON,
      timezone: env.FORECAST_VALIDATION_TIMEZONE,
    },
  };
};
