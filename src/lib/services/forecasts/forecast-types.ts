import { z } from "zod";

/**
 * Shared, browser-safe contract for the Sales Forecasts feature.
 *
 * The Zod schemas below mirror 1:1 the camelCase JSON emitted by the Python
 * forecast engine (`forecast-service/forecast_service/schemas.py`). The same
 * schemas validate engine → server (forecast-engine.server.ts) and
 * server → browser (forecast-client.ts), so there is no re-mapping layer.
 * Contract changes must land in both places in the same PR.
 */

// ---------------------------------------------------------------------------
// Horizons
// ---------------------------------------------------------------------------

export const forecastHorizonOptions = [7, 14, 30, 90] as const;
export type ForecastHorizonDays = (typeof forecastHorizonOptions)[number];
export const defaultForecastHorizonDays: ForecastHorizonDays = 30;

export const forecastHorizonLabels: Record<ForecastHorizonDays, string> = {
  7: "Next 7 days",
  14: "Next 2 weeks",
  30: "Next 30 days",
  90: "Next 90 days",
};

export function isForecastHorizon(value: number): value is ForecastHorizonDays {
  return (forecastHorizonOptions as readonly number[]).includes(value);
}

// ---------------------------------------------------------------------------
// Primitive schemas
// ---------------------------------------------------------------------------

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD)");

// ---------------------------------------------------------------------------
// Model catalog (GET /models on the engine, GET /api/forecasts/models here)
// ---------------------------------------------------------------------------

export const forecastModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  version: z.string().default("0"),
  minHistoryDays: z.number().int().nonnegative(),
  recommendedHorizons: z.array(z.number().int().positive()).default([]),
  supportsHolidays: z.boolean().default(false),
});
export type ForecastModel = z.infer<typeof forecastModelSchema>;

export const forecastModelsResponseSchema = z.object({
  models: z.array(forecastModelSchema),
});
export type ForecastModelsResponse = z.infer<
  typeof forecastModelsResponseSchema
>;

// ---------------------------------------------------------------------------
// Forecast result (POST /forecast on the engine, POST /api/forecasts/run here)
// ---------------------------------------------------------------------------

export const forecastPointSchema = z.object({
  ds: isoDateSchema,
  yhat: z.number(),
  lo80: z.number(),
  hi80: z.number(),
  lo95: z.number(),
  hi95: z.number(),
});
export type ForecastPoint = z.infer<typeof forecastPointSchema>;

export const forecastHistoryPointSchema = z.object({
  ds: isoDateSchema,
  y: z.number(),
  fitted: z.number().nullable().default(null),
});
export type ForecastHistoryPoint = z.infer<typeof forecastHistoryPointSchema>;

export const forecastSummarySchema = z.object({
  horizonTotal: z.number(),
  horizonLower80: z.number(),
  horizonUpper80: z.number(),
  samePeriodLastYear: z.number().nullable().default(null),
  vsLastYearPct: z.number().nullable().default(null),
  trailingPeriodTotal: z.number(),
  vsTrailingPct: z.number().nullable().default(null),
  averageDaily: z.number(),
  peakDay: isoDateSchema,
  peakDayValue: z.number(),
  lowDay: isoDateSchema,
  lowDayValue: z.number(),
  averageOrderValue: z.number().nullable().default(null),
});
export type ForecastSummary = z.infer<typeof forecastSummarySchema>;

export const forecastAccuracyGrades = ["high", "medium", "low"] as const;
export type ForecastAccuracyGrade = (typeof forecastAccuracyGrades)[number];

export const forecastAccuracySchema = z.object({
  holdoutDays: z.number().int().nonnegative(),
  folds: z.number().int().nonnegative(),
  wapePct: z.number(),
  mapePct: z.number().nullable().default(null),
  mae: z.number(),
  biasPct: z.number(),
  coverage80Pct: z.number().nullable().default(null),
  grade: z.enum(forecastAccuracyGrades),
  gradeLabel: z.string().default(""),
});
export type ForecastAccuracy = z.infer<typeof forecastAccuracySchema>;

export const forecastTrendDirections = ["up", "flat", "down"] as const;
export type ForecastTrendDirection = (typeof forecastTrendDirections)[number];

export const forecastHolidayNoteSchema = z.object({
  ds: isoDateSchema,
  name: z.string(),
  expectedEffectPct: z.number().nullable().default(null),
});
export type ForecastHolidayNote = z.infer<typeof forecastHolidayNoteSchema>;

export const forecastSeasonalitySchema = z.object({
  strongestWeekday: z.string().nullable().default(null),
  weakestWeekday: z.string().nullable().default(null),
  weekdayUpliftPct: z.number().nullable().default(null),
  yearlySeasonalityUsed: z.boolean().default(false),
  holidaysUsed: z.boolean().default(false),
  upcomingHolidays: z.array(forecastHolidayNoteSchema).default([]),
  notes: z.array(z.string()).default([]),
});
export type ForecastSeasonality = z.infer<typeof forecastSeasonalitySchema>;

export const forecastWarningCodes = [
  "INSUFFICIENT_FOR_YEARLY",
  "GAPS_FILLED",
  "CLOSURE_PERIOD",
  "NEGATIVE_CLIPPED",
  "OUTLIERS_DETECTED",
  "HORIZON_LONG_FOR_HISTORY",
  "HOLIDAYS_UNAVAILABLE",
  "FALLBACK_MODEL_USED",
] as const;
export type ForecastWarningCode = (typeof forecastWarningCodes)[number];

export const forecastWarningSchema = z.object({
  // Accept unknown codes so a newer engine never breaks an older UI.
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).default({}),
});
export type ForecastWarning = z.infer<typeof forecastWarningSchema>;

export const forecastResultSchema = z.object({
  modelId: z.string().min(1),
  modelName: z.string().min(1),
  modelVersion: z.string().default("0"),
  engineVersion: z.string().default("0"),
  horizonDays: z.number().int().positive(),
  cutoffDate: isoDateSchema,
  history: z.array(forecastHistoryPointSchema),
  forecast: z.array(forecastPointSchema),
  summary: forecastSummarySchema,
  accuracy: forecastAccuracySchema.nullable().default(null),
  trendDirection: z.enum(forecastTrendDirections),
  trendPctPer30d: z.number().default(0),
  seasonality: forecastSeasonalitySchema,
  warnings: z.array(forecastWarningSchema).default([]),
  runtimeMs: z.number().nonnegative(),
  generatedAt: z.string(),
  // Added by the SvelteKit orchestrator (absent on the raw engine response).
  brandAlias: z.string().optional(),
  brandName: z.string().optional(),
  cached: z.boolean().optional(),
  missingDays: z.number().int().nonnegative().optional(),
  /** Location filter the forecast was computed for (null = all locations). */
  locationId: z.number().int().nullable().optional(),
  locationName: z.string().nullable().optional(),
});
export type ForecastResult = z.infer<typeof forecastResultSchema>;

// ---------------------------------------------------------------------------
// Requests to our own API
// ---------------------------------------------------------------------------

export const forecastRunRequestSchema = z.object({
  brandAlias: z.string().trim().min(1).max(64),
  modelId: z.string().trim().min(1).max(64),
  horizonDays: z.union([
    z.literal(7),
    z.literal(14),
    z.literal(30),
    z.literal(90),
  ]),
  /** `tran_location` id; null/absent = every location of the brand. */
  locationId: z.number().int().positive().nullable().optional(),
});
export type ForecastRunRequest = z.infer<typeof forecastRunRequestSchema>;

export const forecastHistoryRequestSchema = z.object({
  brand: z.string().trim().min(1).max(64),
  days: z.coerce.number().int().min(7).max(730).default(90),
  location: z.coerce.number().int().positive().optional(),
});

export const dailySalesPointSchema = z.object({
  ds: isoDateSchema,
  revenue: z.number(),
  orders: z.number(),
});
export type DailySalesPoint = z.infer<typeof dailySalesPointSchema>;

export const forecastHistoryResponseSchema = z.object({
  brandAlias: z.string(),
  latestSalesDate: isoDateSchema,
  /** Total days of usable sales history the brand has (drives "model needs N days"). */
  historyDays: z.number().int().nonnegative(),
  points: z.array(dailySalesPointSchema),
  /** Echo of the requested location filter (null = all locations). */
  locationId: z.number().int().nullable().optional(),
});
export type ForecastHistoryResponse = z.infer<
  typeof forecastHistoryResponseSchema
>;

// ---------------------------------------------------------------------------
// Locations of a brand (GET /api/forecasts/locations)
// ---------------------------------------------------------------------------

export const forecastLocationSchema = z.object({
  /** `transactions.tran_location` */
  id: z.number().int(),
  /** `transactions.location_name` (falls back to "Location <id>") */
  name: z.string(),
});
export type ForecastLocation = z.infer<typeof forecastLocationSchema>;

export const forecastLocationsRequestSchema = z.object({
  brand: z.string().trim().min(1).max(64),
});

export const forecastLocationsResponseSchema = z.object({
  brandAlias: z.string(),
  locations: z.array(forecastLocationSchema),
});
export type ForecastLocationsResponse = z.infer<
  typeof forecastLocationsResponseSchema
>;

// ---------------------------------------------------------------------------
// Error envelope (engine and our API share the shape)
// ---------------------------------------------------------------------------

export const forecastErrorCodes = [
  "NOT_CONFIGURED",
  "ENGINE_UNAVAILABLE",
  "ENGINE_TIMEOUT",
  "ENGINE_REJECTED",
  "INVALID_RESPONSE",
  "UNKNOWN_MODEL",
  "INSUFFICIENT_HISTORY",
  "NO_SALES_DATA",
  "BAD_REQUEST",
  "FORBIDDEN",
  "INTERNAL",
] as const;
export type ForecastErrorCode = (typeof forecastErrorCodes)[number];

export const forecastErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ForecastErrorResponse = z.infer<typeof forecastErrorResponseSchema>;

/** Error codes for which a retry is likely to succeed. */
export const retryableForecastErrorCodes: ReadonlySet<string> = new Set([
  "ENGINE_UNAVAILABLE",
  "ENGINE_TIMEOUT",
  "INTERNAL",
]);

// ---------------------------------------------------------------------------
// URL filters (the URL is the source of truth for the page state)
// ---------------------------------------------------------------------------

export type ForecastFilters = {
  /** Brand alias (warehouse code) or null when none requested. */
  brand: string | null;
  /** Selected model ids, normalised to catalog order. */
  models: string[];
  horizon: ForecastHorizonDays;
  /** `tran_location` id, or null for all locations of the brand. */
  location: number | null;
};

export const FORECAST_DEFAULT_MODEL_COUNT = 2;

export function defaultForecastModelIds(catalog: ForecastModel[]): string[] {
  return catalog
    .slice(0, FORECAST_DEFAULT_MODEL_COUNT)
    .map((model) => model.id);
}

/**
 * Parses `?brand=&models=&horizon=&location=` from the URL. Unknown model ids are
 * dropped and the remaining ids are re-ordered to catalog order; a missing
 * `models` param selects the first two catalog models; a bad horizon falls
 * back to the default. The brand alias is trimmed and lowercased but NOT
 * validated here — server code must check it against the user's scope.
 */
export function parseForecastFilters(
  searchParams: URLSearchParams,
  catalog: ForecastModel[],
): ForecastFilters {
  const rawBrand = searchParams.get("brand")?.trim().toLowerCase() ?? "";
  const brand = rawBrand.length > 0 ? rawBrand : null;

  const catalogIds = catalog.map((model) => model.id);
  const rawModels = searchParams.get("models");
  let models: string[];
  if (rawModels === null) {
    models = defaultForecastModelIds(catalog);
  } else {
    const requested = new Set(
      rawModels
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    );
    models = catalogIds.filter((id) => requested.has(id));
  }

  const rawHorizon = Number.parseInt(searchParams.get("horizon") ?? "", 10);
  const horizon = isForecastHorizon(rawHorizon)
    ? rawHorizon
    : defaultForecastHorizonDays;

  const location = parseLocationParam(searchParams.get("location"));

  return { brand, models, horizon, location };
}

/** Positive integer location id, else null (= all locations). */
export function parseLocationParam(
  raw: string | null | undefined,
): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Builds a shareable href for the given filters, omitting defaults so URLs
 * stay short (no `horizon=30`, no `models=` when equal to the default set).
 */
export function buildForecastHref(
  basePath: string,
  filters: ForecastFilters,
  catalog: ForecastModel[],
): string {
  const params = new URLSearchParams();
  if (filters.brand) {
    params.set("brand", filters.brand);
  }
  const defaults = defaultForecastModelIds(catalog);
  const isDefaultModels =
    filters.models.length === defaults.length &&
    filters.models.every((id, index) => id === defaults[index]);
  if (!isDefaultModels) {
    params.set("models", filters.models.join(","));
  }
  if (filters.horizon !== defaultForecastHorizonDays) {
    params.set("horizon", String(filters.horizon));
  }
  if (filters.location !== null && filters.location !== undefined) {
    params.set("location", String(filters.location));
  }
  const query = params.toString();
  return query.length > 0 ? `${basePath}?${query}` : basePath;
}

// ---------------------------------------------------------------------------
// Per-model visual identity (stable across selections: catalog index based)
// ---------------------------------------------------------------------------

export type ModelStroke = { color: string; dash: string };

const MODEL_DASHES = ["", "6 3", "2 3", "8 3 2 3"] as const;

/** Index of the model in the server catalog, or 0 when unknown. */
export function modelColorIndex(
  modelId: string,
  catalog: ForecastModel[],
): number {
  const index = catalog.findIndex((model) => model.id === modelId);
  return index >= 0 ? index : 0;
}

/**
 * `--chart-1` is reserved for actual sales; models cycle through
 * `--chart-2..5`. The `--chart-*` ramp is near-neutral, so every model also
 * gets a distinct dash pattern — colour alone is never the only cue.
 */
export function modelStroke(index: number): ModelStroke {
  const safe = Math.max(0, index);
  return {
    color: `var(--chart-${2 + (safe % 4)})`,
    dash: MODEL_DASHES[safe % MODEL_DASHES.length],
  };
}
