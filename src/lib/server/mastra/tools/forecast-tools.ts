import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type {
  ForecastLocation,
  ForecastModel,
} from "../../../services/forecasts/forecast-types";
import {
  BRAND_SCOPE_NAMES_RUNTIME_KEY,
  BRAND_SCOPE_RUNTIME_KEY,
} from "../chat-registry";
import {
  buildCompareOutput,
  compactForecast,
  type CompareFailure,
} from "./forecast-compact";
import {
  getForecastGateway,
  type ForecastGateway,
  type ForecastGatewayError,
} from "./forecast-gateway";

/**
 * Forecast tools for the Forecasts Assistant (agents/forecasts-agent.ts).
 *
 * Every tool:
 * - takes the brand from the model but AUTHORISES it against the brand scope
 *   the chat endpoint published in the RequestContext (never client-supplied;
 *   fails closed when the key is missing — same guardrail as
 *   query-sales-sql.ts);
 * - reaches the forecast services through the injected {@link ForecastGateway}
 *   (see forecast-gateway.ts for why) and fails closed when none is installed;
 * - returns `{ ok: true, … } | { ok: false, code, error }` and never throws,
 *   so the agent can explain failures instead of crashing the step;
 * - returns compact, pre-rounded output (forecast-compact.ts) so the model
 *   relays numbers rather than computing them.
 */

// ---------------------------------------------------------------------------
// Shared result shapes
// ---------------------------------------------------------------------------

export type ToolFailure = {
  ok: false;
  code: string;
  error: string;
  retryable?: boolean;
};

function fail(code: string, error: string, retryable = false): ToolFailure {
  return { ok: false, code, error, retryable };
}

/** The exact sentence the agent must reply with for an out-of-scope brand. */
export const REFUSAL_SENTENCE = "You're not assigned to this brand";

/** Highest number of models one comparison may run. */
export const COMPARE_MAX_MODELS = 4;
/** Forecast runs in flight per comparison (the sidecar admits 6 globally). */
export const COMPARE_CONCURRENCY = 2;
/** Locations listed per coverage call. */
export const COVERAGE_MAX_LOCATIONS = 60;

// ---------------------------------------------------------------------------
// Brand scope (published by the chat endpoint, read here as a hard guardrail)
// ---------------------------------------------------------------------------

/** Minimal view of Mastra's RequestContext used by the tools. */
export type RequestContextLike = { get(key: string): unknown };

export type ScopedBrand = { alias: string; name: string };

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : undefined;
}

/**
 * Brands the caller may forecast, or a failure when the scope is missing
 * (fails closed) or empty.
 */
export function resolveBrandScope(
  requestContext: RequestContextLike | undefined,
): { ok: true; brands: ScopedBrand[] } | ToolFailure {
  const aliases = stringArray(requestContext?.get(BRAND_SCOPE_RUNTIME_KEY));

  if (aliases === undefined) {
    return fail(
      "SCOPE_MISSING",
      "Brand scope is missing for this request — nothing was run. Tell the " +
        "user their forecasts cannot be accessed right now.",
    );
  }

  if (aliases.length === 0) {
    return fail(
      "NO_BRANDS",
      "The current user has no assigned brands — no forecasts are available " +
        "to them. Do not call any tool.",
    );
  }

  const names = stringArray(requestContext?.get(BRAND_SCOPE_NAMES_RUNTIME_KEY));
  return {
    ok: true,
    brands: aliases.map((alias, index) => ({
      alias,
      name: names?.[index] ?? alias,
    })),
  };
}

/** Resolves a model-supplied alias against the scope; fails closed. */
export function authorizeBrand(
  brandAlias: string,
  requestContext: RequestContextLike | undefined,
): { ok: true; brand: ScopedBrand } | ToolFailure {
  const scope = resolveBrandScope(requestContext);
  if (!scope.ok) {
    return scope;
  }

  const wanted = brandAlias.trim().toLowerCase();
  const brand = scope.brands.find(
    (candidate) => candidate.alias.trim().toLowerCase() === wanted,
  );

  if (!brand) {
    return fail(
      "FORBIDDEN",
      `The brand "${brandAlias}" is not among the user's assigned brands. ` +
        `Do not retry with another alias. Reply exactly: ${REFUSAL_SENTENCE}`,
    );
  }

  return { ok: true, brand };
}

// ---------------------------------------------------------------------------
// Gateway plumbing
// ---------------------------------------------------------------------------

export function requireGateway():
  | { ok: true; gateway: ForecastGateway }
  | ToolFailure {
  const gateway = getForecastGateway();
  if (!gateway) {
    return fail(
      "GATEWAY_UNAVAILABLE",
      "Forecast tools are only available inside the marketing tool (no " +
        "forecast gateway is installed in this runtime). Answer from the " +
        "forecast-models skill instead and tell the user live forecasts are " +
        "unavailable here.",
    );
  }
  return { ok: true, gateway };
}

const GATEWAY_HINTS: Record<string, string> = {
  NOT_CONFIGURED:
    "The forecast service is not configured. Tell the user forecasts are unavailable and to contact the data team.",
  ENGINE_UNAVAILABLE:
    "The forecast service could not be reached — it may be restarting. Tell the user to try again in a moment.",
  ENGINE_TIMEOUT:
    "The model did not finish in time. Suggest trying again or a shorter horizon.",
  ENGINE_REJECTED:
    "The forecast service refused the request (it may be busy). Tell the user to retry in a moment.",
  INSUFFICIENT_HISTORY:
    "Quote this to the user and suggest a model with a lower minimum history (see listForecastModels) or forecasting all locations instead of one.",
  NO_SALES_DATA:
    "There is nothing to forecast for this brand/location. Tell the user plainly.",
  UNKNOWN_MODEL: "Call listForecastModels and use one of the listed ids.",
};

export function failureFromGateway(error: ForecastGatewayError): ToolFailure {
  const hint = GATEWAY_HINTS[error.code];
  return fail(
    error.code,
    hint ? `${error.message} ${hint}` : error.message,
    error.retryable,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function modelIds(models: ForecastModel[]): string {
  return models.map((model) => model.id).join(", ");
}

/**
 * Turns an optional location id or name fragment into a catalog location.
 * `location: null` means "all locations". Names match case-insensitively on
 * a substring so "limassol" finds "Limassol Marina"; several matches are
 * reported back so the model can ask the user to pick.
 */
export async function resolveLocation(
  gateway: ForecastGateway,
  brandAlias: string,
  input: { locationId?: number | null; locationName?: string | null },
): Promise<{ ok: true; location: ForecastLocation | null } | ToolFailure> {
  const wantedId = input.locationId ?? null;
  const wantedName = input.locationName?.trim() ?? "";

  if (wantedId === null && wantedName.length === 0) {
    return { ok: true, location: null };
  }

  const listed = await gateway.listLocations(brandAlias);
  if (!listed.ok) {
    return failureFromGateway(listed.error);
  }
  const locations = listed.value;

  if (wantedId !== null) {
    const match = locations.find((location) => location.id === wantedId);
    return match
      ? { ok: true, location: match }
      : fail(
          "UNKNOWN_LOCATION",
          `Location ${wantedId} does not belong to ${brandAlias}. Known locations: ${describeLocations(locations)}.`,
        );
  }

  const needle = wantedName.toLowerCase();
  const matches = locations.filter((location) =>
    location.name.toLowerCase().includes(needle),
  );
  if (matches.length === 1) {
    return { ok: true, location: matches[0] };
  }
  if (matches.length === 0) {
    return fail(
      "UNKNOWN_LOCATION",
      `No location of ${brandAlias} matches "${wantedName}". Known locations: ${describeLocations(locations)}.`,
    );
  }
  return fail(
    "AMBIGUOUS_LOCATION",
    `Several locations of ${brandAlias} match "${wantedName}": ${describeLocations(matches)}. Ask the user which one they mean (or pass its locationId).`,
  );
}

function describeLocations(locations: ForecastLocation[]): string {
  const shown = locations
    .slice(0, 30)
    .map((location) => `${location.name} (id ${location.id})`)
    .join(", ");
  return locations.length > 30
    ? `${shown} … and ${locations.length - 30} more`
    : shown;
}

/** `Promise.all` with at most `limit` tasks running at once (order preserved). */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index], index);
    }
  };

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const brandAliasSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .describe(
    "Brand alias (warehouse code, e.g. 'bk') — must be one of the brands in the Brand scope section.",
  );

/** Same literal union as the app's own run request, so cache keys line up. */
const horizonSchema = z
  .union([z.literal(7), z.literal(14), z.literal(30), z.literal(90)])
  .default(30)
  .describe("Forecast horizon in days: 7, 14, 30 or 90 (default 30).");

const locationIdSchema = z
  .number()
  .int()
  .positive()
  .nullable()
  .optional()
  .describe(
    "tran_location id to forecast a single store. Omit (or null) for the whole brand.",
  );

const locationNameSchema = z
  .string()
  .trim()
  .max(120)
  .optional()
  .describe(
    "Store name or fragment (e.g. 'Limassol') when the user names a store instead of an id. Ambiguous names are reported back.",
  );

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const listForecastModels = createTool({
  id: "list-forecast-models",
  description:
    "List the forecasting models available in the Sales Forecasts engine: id, " +
    "name, one-line description, minimum days of sales history required, " +
    "recommended horizons and whether public holidays are modelled. Cheap; " +
    "use it to validate a model id or to tell the user what is available. " +
    "For how the models work and what the metrics mean, load the " +
    "'forecast-models' skill instead.",
  inputSchema: z.object({}),
  execute: async () => {
    const access = requireGateway();
    if (!access.ok) {
      return access;
    }
    const models = await access.gateway.listModels();
    if (!models.ok) {
      return failureFromGateway(models.error);
    }
    return {
      ok: true as const,
      models: models.value.map((model) => ({
        id: model.id,
        name: model.name,
        description: model.description,
        minHistoryDays: model.minHistoryDays,
        recommendedHorizons: model.recommendedHorizons,
        supportsHolidays: model.supportsHolidays,
      })),
    };
  },
});

export const getSalesHistoryCoverage = createTool({
  id: "get-sales-history-coverage",
  description:
    "How much daily sales history a brand has (last recorded sales day = the " +
    "forecast cutoff, days with sales in the lookback window) and which " +
    "models it qualifies for. With perLocation=true also lists every store " +
    "of the brand with its own coverage and eligible models — use that for " +
    "'which locations have enough history for X?' or to find a store's id. " +
    "Runs no forecast; call it before forecasting a single store.",
  inputSchema: z.object({
    brandAlias: brandAliasSchema,
    perLocation: z
      .boolean()
      .default(false)
      .describe("Also return per-store coverage (default false)."),
  }),
  execute: async ({ brandAlias, perLocation }, context) => {
    const authorized = authorizeBrand(brandAlias, context?.requestContext);
    if (!authorized.ok) {
      return authorized;
    }
    const access = requireGateway();
    if (!access.ok) {
      return access;
    }
    const { gateway } = access;
    const { brand } = authorized;

    const models = await gateway.listModels();
    if (!models.ok) {
      return failureFromGateway(models.error);
    }
    const coverage = await gateway.getBrandCoverage(brand.alias, null);
    if (!coverage.ok) {
      return failureFromGateway(coverage.error);
    }

    const historyDays = coverage.value?.historyDays ?? 0;
    const eligible = models.value.filter(
      (model) => model.minHistoryDays <= historyDays,
    );
    const ineligible = models.value.filter(
      (model) => model.minHistoryDays > historyDays,
    );

    const base = {
      ok: true as const,
      brandAlias: brand.alias,
      brandName: brand.name,
      latestSalesDate: coverage.value?.latestSalesDate ?? null,
      historyDays,
      eligibleModels: eligible.map((model) => ({
        id: model.id,
        name: model.name,
        minHistoryDays: model.minHistoryDays,
      })),
      ineligibleModels: ineligible.map((model) => ({
        id: model.id,
        name: model.name,
        needsDays: model.minHistoryDays,
        shortBy: model.minHistoryDays - historyDays,
      })),
      note:
        coverage.value === null
          ? "No sales were recorded for this brand in the lookback window — there is nothing to forecast."
          : null,
    };

    if (!perLocation) {
      return base;
    }

    const perStore = await gateway.getLocationCoverage(brand.alias);
    if (!perStore.ok) {
      return failureFromGateway(perStore.error);
    }
    const sorted = [...perStore.value].sort(
      (a, b) =>
        b.daysWithSales - a.daysWithSales || a.name.localeCompare(b.name),
    );
    const shown = sorted.slice(0, COVERAGE_MAX_LOCATIONS);

    return {
      ...base,
      locationCount: sorted.length,
      locationsTruncated: sorted.length > shown.length,
      locations: shown.map((location) => ({
        id: location.id,
        name: location.name,
        daysWithSales: location.daysWithSales,
        firstSalesDate: location.firstSalesDate,
        latestSalesDate: location.latestSalesDate,
        eligibleModelIds: models.value
          .filter((model) => model.minHistoryDays <= location.daysWithSales)
          .map((model) => model.id),
      })),
    };
  },
});

/** Exported for tests (Mastra exposes `inputSchema` as a StandardSchema only). */
export const getForecastSummaryInputSchema = z.object({
  brandAlias: brandAliasSchema,
  modelId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .default("blend")
    .describe(
      "Model id from listForecastModels (default 'blend', the ensemble).",
    ),
  horizonDays: horizonSchema,
  locationId: locationIdSchema,
  locationName: locationNameSchema,
});

export const getForecastSummary = createTool({
  id: "get-forecast-summary",
  description:
    "Run (or fetch from cache) ONE forecast model for one brand — optionally " +
    "one store — over a 7/14/30/90-day horizon and return a compact summary: " +
    "expected total with its likely range, vs last year / vs the trailing " +
    "period, trend, weekday pattern, upcoming holidays, accuracy on recent " +
    "data (WAPE/MAPE/grade), data warnings, ready-made sentences, and either " +
    "day-by-day figures (horizon ≤ 14) or weekly totals (30/90). A cold run " +
    "takes a few seconds (Blend runs three models). Default model 'blend'.",
  inputSchema: getForecastSummaryInputSchema,
  execute: async (
    { brandAlias, modelId, horizonDays, locationId, locationName },
    context,
  ) => {
    const authorized = authorizeBrand(brandAlias, context?.requestContext);
    if (!authorized.ok) {
      return authorized;
    }
    const access = requireGateway();
    if (!access.ok) {
      return access;
    }
    const { gateway } = access;
    const { brand } = authorized;

    const models = await gateway.listModels();
    if (!models.ok) {
      return failureFromGateway(models.error);
    }
    const model = models.value.find((candidate) => candidate.id === modelId);
    if (!model) {
      return fail(
        "UNKNOWN_MODEL",
        `Unknown model "${modelId}". Available ids: ${modelIds(models.value)}.`,
      );
    }

    const located = await resolveLocation(gateway, brand.alias, {
      locationId,
      locationName,
    });
    if (!located.ok) {
      return located;
    }

    const run = await gateway.runForecast({
      brandAlias: brand.alias,
      brandName: brand.name,
      modelId: model.id,
      horizonDays,
      locationId: located.location?.id ?? null,
      locationName: located.location?.name ?? null,
    });
    if (!run.ok) {
      return failureFromGateway(run.error);
    }

    return { ok: true as const, forecast: compactForecast(run.value) };
  },
});

export const compareForecastModels = createTool({
  id: "compare-forecast-models",
  description:
    "Run several forecast models (2–4) on the same brand/store/horizon and " +
    "return the Compare-page table (total, range, vs last year, vs trailing, " +
    "grade, typical miss), the spread between models, an agreement sentence " +
    "and the recommendation of which number to plan with — plus per-model " +
    "detail (accuracy, warnings, seasonality). Use for 'which model should I " +
    "trust', 'why do the models differ', 'which number should I plan with'. " +
    "Costs a few seconds per model that is not cached; models that fail are " +
    "reported in `failures` while the rest still compare.",
  inputSchema: z.object({
    brandAlias: brandAliasSchema,
    modelIds: z
      .array(z.string().trim().min(1).max(64))
      .min(1)
      .max(6)
      .optional()
      .describe(
        `Model ids to compare (2–${COMPARE_MAX_MODELS}). Omit for the default set: every model except 'blend', up to three.`,
      ),
    horizonDays: horizonSchema,
    locationId: locationIdSchema,
    locationName: locationNameSchema,
  }),
  execute: async (
    {
      brandAlias,
      modelIds: requestedIds,
      horizonDays,
      locationId,
      locationName,
    },
    context,
  ) => {
    const authorized = authorizeBrand(brandAlias, context?.requestContext);
    if (!authorized.ok) {
      return authorized;
    }
    const access = requireGateway();
    if (!access.ok) {
      return access;
    }
    const { gateway } = access;
    const { brand } = authorized;

    const catalog = await gateway.listModels();
    if (!catalog.ok) {
      return failureFromGateway(catalog.error);
    }
    const byId = new Map(catalog.value.map((model) => [model.id, model]));

    const wanted =
      requestedIds && requestedIds.length > 0
        ? [...new Set(requestedIds)]
        : catalog.value
            .filter((model) => model.id !== "blend")
            .slice(0, 3)
            .map((model) => model.id);

    const failures: CompareFailure[] = [];
    const models: ForecastModel[] = [];
    for (const id of wanted) {
      const model = byId.get(id);
      if (model) {
        models.push(model);
      } else {
        failures.push({
          modelId: id,
          code: "UNKNOWN_MODEL",
          message: `Unknown model "${id}". Available ids: ${modelIds(catalog.value)}.`,
        });
      }
    }

    const skipped = models.splice(COMPARE_MAX_MODELS);
    for (const model of skipped) {
      failures.push({
        modelId: model.id,
        code: "TOO_MANY_MODELS",
        message: `Not run — at most ${COMPARE_MAX_MODELS} models per comparison.`,
      });
    }

    if (models.length === 0) {
      return fail(
        "UNKNOWN_MODEL",
        `None of the requested models exist. Available ids: ${modelIds(catalog.value)}.`,
      );
    }

    const located = await resolveLocation(gateway, brand.alias, {
      locationId,
      locationName,
    });
    if (!located.ok) {
      return located;
    }

    const outcomes = await mapWithConcurrency(
      models,
      COMPARE_CONCURRENCY,
      (model) =>
        gateway.runForecast({
          brandAlias: brand.alias,
          brandName: brand.name,
          modelId: model.id,
          horizonDays,
          locationId: located.location?.id ?? null,
          locationName: located.location?.name ?? null,
        }),
    );

    const results = [];
    for (const [index, outcome] of outcomes.entries()) {
      if (outcome.ok) {
        results.push(outcome.value);
      } else {
        failures.push({
          modelId: models[index].id,
          code: outcome.error.code,
          message: outcome.error.message,
        });
      }
    }

    if (results.length === 0) {
      return fail(
        failures[0]?.code ?? "MODEL_FAILED",
        `No model produced a forecast. ${failures.map((failure) => `${failure.modelId}: ${failure.message}`).join(" | ")}`,
        failures.some((failure) => failure.code === "ENGINE_UNAVAILABLE"),
      );
    }

    return {
      ok: true as const,
      compare: buildCompareOutput(results, failures),
    };
  },
});

/** Tools spread into the forecasts agent (`tools: { ...forecastTools }`). */
export const forecastTools = {
  listForecastModels,
  getSalesHistoryCoverage,
  getForecastSummary,
  compareForecastModels,
};
