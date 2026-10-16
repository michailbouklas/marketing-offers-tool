import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type {
  Ga4FilterExpression,
  Ga4NumericValue,
  Ga4OrderBy,
  Ga4ReportResponse,
  Ga4Row,
} from "../../../services/google-analytics/ga4-client.server";
import { formatGa4Date } from "../../../services/google-analytics/dashboard-reports";
import {
  computeDelta,
  googleAnalyticsRangeOptions,
  type GoogleAnalyticsBreakdownRow,
  type GoogleAnalyticsDashboard,
  type GoogleAnalyticsTotals,
} from "../../../services/google-analytics/google-analytics";
import {
  GOOGLE_ANALYTICS_SCOPE_RUNTIME_KEY,
  type GoogleAnalyticsScopeEntry,
} from "../chat-registry";
import {
  getGoogleAnalyticsGateway,
  type GoogleAnalyticsGateway,
  type GoogleAnalyticsGatewayError,
} from "./google-analytics-gateway";

/**
 * Google Analytics tools for the Google Analytics Assistant
 * (agents/google-analytics-agent.ts).
 *
 * Every tool:
 * - takes a `propertyRowId` from the model but AUTHORISES it against the
 *   property scope the chat endpoint published in the RequestContext (never
 *   client-supplied; fails closed when the key is missing);
 * - reaches Google through the injected {@link GoogleAnalyticsGateway} (see
 *   google-analytics-gateway.ts for why) and fails closed when none is
 *   installed;
 * - returns `{ ok: true, … } | { ok: false, code, error }` and never throws,
 *   so the agent can explain failures (or fix an INVALID_ARGUMENT request and
 *   retry) instead of crashing the step;
 * - caps what one call may ask for, so a chat turn stays within a handful of
 *   Data API tokens and a few hundred rows.
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

/** The exact sentence the agent must reply with for an out-of-scope property. */
export const REFUSAL_SENTENCE = "You're not assigned to this brand";

/** Rows one report may return (Google's `limit`); mirrors the SQL tools' cap. */
export const REPORT_MAX_ROWS = 200;
export const REPORT_DEFAULT_ROWS = 50;
export const REPORT_MAX_DIMENSIONS = 4;
export const REPORT_MAX_METRICS = 10;
export const REPORT_MAX_DATE_RANGES = 2;
export const REALTIME_MAX_ROWS = 50;
export const FIELD_SEARCH_MAX_HITS = 40;

// ---------------------------------------------------------------------------
// Property scope (published by the chat endpoint, read here as a hard guardrail)
// ---------------------------------------------------------------------------

/** Minimal view of Mastra's RequestContext used by the tools. */
export type RequestContextLike = { get(key: string): unknown };

function isScopeEntry(value: unknown): value is GoogleAnalyticsScopeEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.brandId === "number" &&
    typeof entry.brandName === "string" &&
    typeof entry.propertyRowId === "string" &&
    typeof entry.propertyId === "string" &&
    typeof entry.displayName === "string"
  );
}

/**
 * Properties the caller may query, or a failure when the scope is missing
 * (fails closed) or empty.
 */
export function resolvePropertyScope(
  requestContext: RequestContextLike | undefined,
): { ok: true; entries: GoogleAnalyticsScopeEntry[] } | ToolFailure {
  const raw = requestContext?.get(GOOGLE_ANALYTICS_SCOPE_RUNTIME_KEY);

  if (!Array.isArray(raw)) {
    return fail(
      "SCOPE_MISSING",
      "Google Analytics scope is missing for this request — nothing was run. " +
        "Tell the user their analytics cannot be accessed right now.",
    );
  }

  const entries = raw.filter(isScopeEntry);

  if (entries.length === 0) {
    return fail(
      "NO_PROPERTIES",
      "The current user has no brand with a Google Analytics property assigned " +
        "to them — there is no analytics data available. Do not call any tool.",
    );
  }

  return { ok: true, entries };
}

/** Resolves a model-supplied property row id against the scope; fails closed. */
export function authorizeProperty(
  propertyRowId: string,
  requestContext: RequestContextLike | undefined,
): { ok: true; property: GoogleAnalyticsScopeEntry } | ToolFailure {
  const scope = resolvePropertyScope(requestContext);
  if (!scope.ok) {
    return scope;
  }

  const wanted = propertyRowId.trim();
  const property = scope.entries.find(
    (entry) => entry.propertyRowId === wanted,
  );

  if (!property) {
    return fail(
      "FORBIDDEN",
      `Property "${propertyRowId}" is not among the user's Google Analytics properties. ` +
        `Do not retry with another id. Reply exactly: ${REFUSAL_SENTENCE}`,
    );
  }

  return { ok: true, property };
}

// ---------------------------------------------------------------------------
// Gateway plumbing
// ---------------------------------------------------------------------------

export function requireGateway():
  | { ok: true; gateway: GoogleAnalyticsGateway }
  | ToolFailure {
  const gateway = getGoogleAnalyticsGateway();
  if (!gateway) {
    return fail(
      "GATEWAY_UNAVAILABLE",
      "Google Analytics tools are only available inside the marketing tool (no " +
        "Google Analytics gateway is installed in this runtime). Tell the user " +
        "live analytics are unavailable here.",
    );
  }
  return { ok: true, gateway };
}

const GATEWAY_HINTS: Record<string, string> = {
  INVALID_ARGUMENT:
    "Google rejected the request. Check every dimension/metric name (use searchGoogleAnalyticsFields), make sure the dimensions and metrics are compatible with each other, and fix the date range or filter syntax. Then retry — at most 3 attempts in total.",
  PERMISSION_DENIED:
    "Tell the user an admin must grant the service account Viewer access on the GA4 property (Admin → Brands).",
  UNAUTHENTICATED:
    "Tell the user an admin must re-upload the service-account key for this property (Admin → Brands).",
  NOT_FOUND:
    "Tell the user the GA4 property id stored for this brand looks wrong and an admin should check it.",
  RESOURCE_EXHAUSTED:
    "The property's Google Analytics API quota is exhausted for now. Tell the user to try again later; do not retry.",
  UNAVAILABLE:
    "Google Analytics could not be reached. Tell the user to try again in a moment.",
  data_api_unreachable:
    "Google Analytics could not be reached. Tell the user to try again in a moment.",
  token_endpoint_unreachable:
    "Google's sign-in service could not be reached. Tell the user to try again in a moment.",
};

export function failureFromGateway(
  error: GoogleAnalyticsGatewayError,
): ToolFailure {
  const hint = GATEWAY_HINTS[error.code];
  return fail(
    error.code,
    hint ? `${error.message} ${hint}` : error.message,
    error.retryable,
  );
}

// ---------------------------------------------------------------------------
// Response flattening
// ---------------------------------------------------------------------------

/** GA4 `date` dimension comes back as YYYYMMDD; everything else as-is. */
function dimensionCell(name: string, value: string | undefined): string {
  const raw = value ?? "";
  return name === "date" ? formatGa4Date(raw) : raw;
}

function metricCell(value: string | undefined): number | null {
  if (value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type FlatRow = Record<string, string | number | null>;

/**
 * Turns GA4's header/row arrays into one object per row keyed by field name
 * (`{ country: "Cyprus", sessions: 1234 }`), which is what the model reads
 * best. Also used for `totals` rows (which carry only metric values plus, with
 * two date ranges, the `dateRange` dimension).
 */
export function flattenRows(
  report: Ga4ReportResponse,
  rows: Ga4Row[] | undefined,
  options: { skipEmptyDimensions?: boolean } = {},
): FlatRow[] {
  const dimensionNames = (report.dimensionHeaders ?? []).map(
    (header) => header.name,
  );
  const metricNames = (report.metricHeaders ?? []).map((header) => header.name);

  return (rows ?? []).map((row) => {
    const flat: FlatRow = {};
    dimensionNames.forEach((name, index) => {
      const value = row.dimensionValues?.[index]?.value;
      // Totals rows carry "RESERVED_TOTAL" / "" in every dimension except the
      // auto-added dateRange; those cells are noise for the model.
      if (
        options.skipEmptyDimensions &&
        (value === undefined || value === "" || value.startsWith("RESERVED_"))
      ) {
        return;
      }
      flat[name] = dimensionCell(name, value);
    });
    metricNames.forEach((name, index) => {
      flat[name] = metricCell(row.metricValues?.[index]?.value);
    });
    return flat;
  });
}

function quotaSummary(report: Ga4ReportResponse) {
  const quota = report.propertyQuota;
  if (!quota) {
    return undefined;
  }
  return {
    tokensPerDay: quota.tokensPerDay ?? null,
    tokensPerHour: quota.tokensPerHour ?? null,
  };
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const propertyRowIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .describe(
    "The property's row id from the Property scope section (NOT the numeric GA4 property id).",
  );

/** GA4 API names: `sessions`, `sessionSourceMedium`, `customEvent:foo`, … */
const fieldNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_]*(:[A-Za-z0-9_]+)?$/, {
    message:
      "Use a GA4 API name such as sessions, activeUsers, sessionSourceMedium or customEvent:name.",
  });

/** `YYYY-MM-DD`, `today`, `yesterday` or `NdaysAgo` (GA4 Data API syntax). */
const ga4DateSchema = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2}|today|yesterday|\d{1,4}daysAgo)$/, {
    message:
      "Dates must be YYYY-MM-DD, 'today', 'yesterday' or 'NdaysAgo' (e.g. 28daysAgo).",
  });

const dateRangeSchema = z.object({
  startDate: ga4DateSchema,
  endDate: ga4DateSchema,
  name: z
    .string()
    .trim()
    .max(40)
    .optional()
    .describe(
      "Optional label; otherwise GA4 names ranges date_range_0, date_range_1.",
    ),
});

const numericValueSchema = z
  .union([
    z.number(),
    z.object({
      int64Value: z.string().optional(),
      doubleValue: z.number().optional(),
    }),
  ])
  .describe("A number (preferred) or GA4's { int64Value | doubleValue } form.");

type NumericInput = z.infer<typeof numericValueSchema>;

const fieldFilterSchema = z
  .object({
    fieldName: fieldNameSchema,
    stringFilter: z
      .object({
        matchType: z
          .enum([
            "EXACT",
            "BEGINS_WITH",
            "ENDS_WITH",
            "CONTAINS",
            "FULL_REGEXP",
            "PARTIAL_REGEXP",
          ])
          .optional(),
        value: z.string().max(500),
        caseSensitive: z.boolean().optional(),
      })
      .optional(),
    inListFilter: z
      .object({
        values: z.array(z.string().max(500)).min(1).max(50),
        caseSensitive: z.boolean().optional(),
      })
      .optional(),
    numericFilter: z
      .object({
        operation: z.enum([
          "EQUAL",
          "LESS_THAN",
          "LESS_THAN_OR_EQUAL",
          "GREATER_THAN",
          "GREATER_THAN_OR_EQUAL",
        ]),
        value: numericValueSchema,
      })
      .optional(),
    betweenFilter: z
      .object({ fromValue: numericValueSchema, toValue: numericValueSchema })
      .optional(),
  })
  .refine(
    (filter) =>
      [
        filter.stringFilter,
        filter.inListFilter,
        filter.numericFilter,
        filter.betweenFilter,
      ].filter(Boolean).length === 1,
    {
      message:
        "A field filter needs exactly one of stringFilter, inListFilter, numericFilter or betweenFilter.",
    },
  );

type FieldFilterInput = z.infer<typeof fieldFilterSchema>;

type FilterExpressionInput = {
  filter?: FieldFilterInput;
  andGroup?: { expressions: FilterExpressionInput[] };
  orGroup?: { expressions: FilterExpressionInput[] };
  notExpression?: FilterExpressionInput;
};

const filterExpressionSchema: z.ZodType<FilterExpressionInput> = z.lazy(() =>
  z
    .object({
      filter: fieldFilterSchema.optional(),
      andGroup: z
        .object({ expressions: z.array(filterExpressionSchema).min(1).max(10) })
        .optional(),
      orGroup: z
        .object({ expressions: z.array(filterExpressionSchema).min(1).max(10) })
        .optional(),
      notExpression: filterExpressionSchema.optional(),
    })
    .refine(
      (expression) =>
        [
          expression.filter,
          expression.andGroup,
          expression.orGroup,
          expression.notExpression,
        ].filter(Boolean).length === 1,
      {
        message:
          "A filter expression needs exactly one of filter, andGroup, orGroup or notExpression.",
      },
    ),
);

const orderBySchema = z
  .object({
    metric: z.object({ metricName: fieldNameSchema }).optional(),
    dimension: z
      .object({
        dimensionName: fieldNameSchema,
        orderType: z
          .enum(["ALPHANUMERIC", "CASE_INSENSITIVE_ALPHANUMERIC", "NUMERIC"])
          .optional(),
      })
      .optional(),
    desc: z.boolean().optional(),
  })
  .refine((order) => Boolean(order.metric) !== Boolean(order.dimension), {
    message: "An orderBy needs exactly one of metric or dimension.",
  });

type OrderByInput = z.infer<typeof orderBySchema>;

/** The schema accepts either member as optional; GA4 wants exactly one. */
function toGa4OrderBy(order: OrderByInput): Ga4OrderBy {
  if (order.metric) {
    return {
      metric: { metricName: order.metric.metricName },
      ...(order.desc !== undefined ? { desc: order.desc } : {}),
    };
  }
  return {
    dimension: {
      dimensionName: order.dimension!.dimensionName,
      ...(order.dimension!.orderType
        ? { orderType: order.dimension!.orderType }
        : {}),
    },
    ...(order.desc !== undefined ? { desc: order.desc } : {}),
  };
}

function toGa4Numeric(value: NumericInput): Ga4NumericValue {
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { int64Value: String(value) }
      : { doubleValue: value };
  }
  return value;
}

/** Converts the (friendlier) parsed filter into GA4's exact JSON shape. */
export function toGa4Filter(
  expression: FilterExpressionInput,
): Ga4FilterExpression {
  if (expression.filter) {
    const {
      fieldName,
      stringFilter,
      inListFilter,
      numericFilter,
      betweenFilter,
    } = expression.filter;
    return {
      filter: {
        fieldName,
        ...(stringFilter ? { stringFilter } : {}),
        ...(inListFilter ? { inListFilter } : {}),
        ...(numericFilter
          ? {
              numericFilter: {
                operation: numericFilter.operation,
                value: toGa4Numeric(numericFilter.value),
              },
            }
          : {}),
        ...(betweenFilter
          ? {
              betweenFilter: {
                fromValue: toGa4Numeric(betweenFilter.fromValue),
                toValue: toGa4Numeric(betweenFilter.toValue),
              },
            }
          : {}),
      },
    };
  }
  if (expression.andGroup) {
    return {
      andGroup: {
        expressions: expression.andGroup.expressions.map(toGa4Filter),
      },
    };
  }
  if (expression.orGroup) {
    return {
      orGroup: { expressions: expression.orGroup.expressions.map(toGa4Filter) },
    };
  }
  return { notExpression: toGa4Filter(expression.notExpression!) };
}

/** Exported for tests (Mastra exposes `inputSchema` as a StandardSchema only). */
export const runReportInputSchema = z.object({
  propertyRowId: propertyRowIdSchema,
  dimensions: z
    .array(fieldNameSchema)
    .max(REPORT_MAX_DIMENSIONS)
    .default([])
    .describe(
      `Dimension API names to group by (0–${REPORT_MAX_DIMENSIONS}), e.g. ["sessionDefaultChannelGroup"]. Omit for a single totals row.`,
    ),
  metrics: z
    .array(fieldNameSchema)
    .min(1)
    .max(REPORT_MAX_METRICS)
    .describe(
      `Metric API names (1–${REPORT_MAX_METRICS}), e.g. ["sessions", "activeUsers", "keyEvents"].`,
    ),
  dateRanges: z
    .array(dateRangeSchema)
    .min(1)
    .max(REPORT_MAX_DATE_RANGES)
    .describe(
      "One range, or two to compare periods (GA4 then adds a dateRange column: date_range_0 = first, date_range_1 = second). End on 'yesterday' unless the user insists on today.",
    ),
  dimensionFilter: filterExpressionSchema
    .optional()
    .describe(
      'Optional GA4 FilterExpression on dimensions, e.g. { "filter": { "fieldName": "sessionSourceMedium", "stringFilter": { "matchType": "CONTAINS", "value": "instagram" } } }.',
    ),
  metricFilter: filterExpressionSchema
    .optional()
    .describe(
      "Optional GA4 FilterExpression on metrics (numericFilter / betweenFilter).",
    ),
  orderBys: z
    .array(orderBySchema)
    .max(3)
    .optional()
    .describe(
      'Sort order, e.g. [{ "metric": { "metricName": "sessions" }, "desc": true }]. Defaults to the first metric descending when dimensions are present.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(REPORT_MAX_ROWS)
    .default(REPORT_DEFAULT_ROWS)
    .describe(
      `Rows to return (1–${REPORT_MAX_ROWS}, default ${REPORT_DEFAULT_ROWS}).`,
    ),
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const listGoogleAnalyticsProperties = createTool({
  id: "list-google-analytics-properties",
  description:
    "List the brands and GA4 properties the current user may ask about, with " +
    "the propertyRowId every other tool needs. Reads the user's scope only — " +
    "no Google call, no quota. Use it when the user asks which brands or " +
    "properties they have, or when you are unsure which propertyRowId to use.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const scope = resolvePropertyScope(context?.requestContext);
    if (!scope.ok) {
      return scope;
    }

    const byBrand = new Map<
      number,
      { brandId: number; brandName: string; properties: unknown[] }
    >();
    for (const entry of scope.entries) {
      const brand = byBrand.get(entry.brandId) ?? {
        brandId: entry.brandId,
        brandName: entry.brandName,
        properties: [],
      };
      brand.properties.push({
        propertyRowId: entry.propertyRowId,
        displayName: entry.displayName,
        ga4PropertyId: entry.propertyId,
      });
      byBrand.set(entry.brandId, brand);
    }

    return { ok: true as const, brands: [...byBrand.values()] };
  },
});

function topRows(rows: GoogleAnalyticsBreakdownRow[], count = 5) {
  return rows.slice(0, count).map((row) => ({
    label: row.label,
    sessions: row.sessions,
    activeUsers: row.activeUsers,
  }));
}

function totalsWithDeltas(
  totals: GoogleAnalyticsTotals,
  previous: GoogleAnalyticsTotals | null,
) {
  const entries = Object.entries(totals) as [
    keyof GoogleAnalyticsTotals,
    number,
  ][];
  return Object.fromEntries(
    entries.map(([key, current]) => {
      const delta = computeDelta(current, previous?.[key]);
      return [
        key,
        {
          current,
          previous: previous?.[key] ?? null,
          changePct:
            delta.pct === null ? null : Math.round(delta.pct * 1000) / 10,
        },
      ];
    }),
  );
}

/** Compacts the page's dashboard model into what a chat answer needs. */
export function compactDashboard(dashboard: GoogleAnalyticsDashboard) {
  const heatmapPeaks = [...dashboard.heatmap]
    .sort((left, right) => right.sessions - left.sessions)
    .slice(0, 3)
    .map((cell) => ({
      dayOfWeek: cell.dayOfWeek,
      hour: cell.hour,
      sessions: cell.sessions,
    }));

  return {
    totals: totalsWithDeltas(dashboard.totals, dashboard.previousTotals),
    daily: dashboard.daily,
    channels: topRows(dashboard.channels),
    pagesAndScreens: topRows(dashboard.pages),
    devices: topRows(dashboard.devices, 10),
    countries: topRows(dashboard.countries),
    cities: topRows(dashboard.cities),
    campaigns: dashboard.campaigns.slice(0, 5).map((row) => ({
      sourceMedium: row.sourceMedium,
      campaign: row.campaign,
      sessions: row.sessions,
      engagementRate: Math.round(row.engagementRate * 1000) / 1000,
      keyEvents: row.keyEvents,
    })),
    landingPages: dashboard.landingPages.slice(0, 5).map((row) => ({
      path: row.path,
      sessions: row.sessions,
      newUsers: row.newUsers,
      avgEngagementSeconds: Math.round(row.avgEngagementSeconds),
      keyEvents: row.keyEvents,
    })),
    newVsReturning: dashboard.newVsReturning.map((segment) => ({
      label: segment.label,
      activeUsers: segment.activeUsers,
      sessions: segment.sessions,
      engagementRate: Math.round(segment.engagementRate * 1000) / 1000,
    })),
    keyEventsByName: dashboard.keyEventsByName.slice(0, 5),
    /** GA4 dayOfWeek: 0 = Sunday … 6 = Saturday; hour 0–23 (property time zone). */
    busiestHours: heatmapPeaks,
  };
}

export const getGoogleAnalyticsOverview = createTool({
  id: "get-google-analytics-overview",
  description:
    "The overview dashboard the user sees on the Google Analytics page for one " +
    "property and preset range (7d / 28d / 90d, all ending yesterday): totals " +
    "with previous-period change, daily users/sessions, top channels, pages, " +
    "devices, countries, cities, campaigns, landing pages, new vs returning, " +
    "key events and the busiest hours. Served from the page's cache when " +
    "fresh (no extra quota). Use it for 'summarise', 'how are we doing', or " +
    "any question the dashboard already answers; use runGoogleAnalyticsReport " +
    "for anything else.",
  inputSchema: z.object({
    propertyRowId: propertyRowIdSchema,
    range: z
      .enum(googleAnalyticsRangeOptions)
      .default("28d")
      .describe("Preset range: 7d, 28d (default) or 90d, ending yesterday."),
  }),
  execute: async ({ propertyRowId, range }, context) => {
    const authorized = authorizeProperty(
      propertyRowId,
      context?.requestContext,
    );
    if (!authorized.ok) {
      return authorized;
    }
    const access = requireGateway();
    if (!access.ok) {
      return access;
    }

    const outcome = await access.gateway.getDashboard(
      authorized.property.propertyRowId,
      range,
    );
    if (!outcome.ok) {
      return failureFromGateway(outcome.error);
    }

    return {
      ok: true as const,
      property: {
        brandName: authorized.property.brandName,
        displayName: authorized.property.displayName,
      },
      range,
      endsOn: "yesterday",
      dashboard: compactDashboard(outcome.value),
    };
  },
});

export const runGoogleAnalyticsReport = createTool({
  id: "run-google-analytics-report",
  description:
    "Run a custom GA4 Data API report (runReport) on one property: pick " +
    `dimensions (≤${REPORT_MAX_DIMENSIONS}), metrics (≤${REPORT_MAX_METRICS}), one or two date ranges, optional ` +
    "filters and sort order. Returns rows as objects keyed by field name, the " +
    `TOTAL row(s), the total row count and whether rows were cut at the limit (max ${REPORT_MAX_ROWS}). ` +
    "Use GA4 API names (sessions, activeUsers, newUsers, keyEvents, " +
    "engagementRate, screenPageViews, sessionDefaultChannelGroup, " +
    "sessionSourceMedium, sessionCampaignName, landingPage, pagePath, " +
    "deviceCategory, country, city, date, …). If Google answers " +
    "INVALID_ARGUMENT, fix the request and retry (max 3 attempts).",
  inputSchema: runReportInputSchema,
  execute: async (input, context) => {
    const authorized = authorizeProperty(
      input.propertyRowId,
      context?.requestContext,
    );
    if (!authorized.ok) {
      return authorized;
    }
    const access = requireGateway();
    if (!access.ok) {
      return access;
    }

    const dimensions = input.dimensions ?? [];
    const limit = input.limit ?? REPORT_DEFAULT_ROWS;
    const orderBys: Ga4OrderBy[] | undefined =
      input.orderBys && input.orderBys.length > 0
        ? input.orderBys.map(toGa4OrderBy)
        : dimensions.length > 0
          ? [{ metric: { metricName: input.metrics[0] }, desc: true }]
          : undefined;

    const outcome = await access.gateway.runReport(
      authorized.property.propertyRowId,
      {
        dimensions: dimensions.map((name) => ({ name })),
        metrics: input.metrics.map((name) => ({ name })),
        dateRanges: input.dateRanges,
        ...(input.dimensionFilter
          ? { dimensionFilter: toGa4Filter(input.dimensionFilter) }
          : {}),
        ...(input.metricFilter
          ? { metricFilter: toGa4Filter(input.metricFilter) }
          : {}),
        ...(orderBys ? { orderBys } : {}),
        limit,
        metricAggregations: ["TOTAL"],
        returnPropertyQuota: true,
      },
    );
    if (!outcome.ok) {
      return failureFromGateway(outcome.error);
    }

    const report = outcome.value;
    const rows = flattenRows(report, report.rows);
    const rowCount = report.rowCount ?? rows.length;

    return {
      ok: true as const,
      property: {
        brandName: authorized.property.brandName,
        displayName: authorized.property.displayName,
      },
      dateRanges: input.dateRanges,
      rowCount,
      returnedRows: rows.length,
      truncated: rowCount > rows.length,
      rows,
      totals: flattenRows(report, report.totals, { skipEmptyDimensions: true }),
      note:
        rows.length === 0
          ? "No rows. Either nothing matched, the data for those days is still being processed by Google, or GA4 withheld the rows (data thresholds). Say so instead of reporting zero."
          : null,
      quota: quotaSummary(report),
    };
  },
});

export const runGoogleAnalyticsRealtimeReport = createTool({
  id: "run-google-analytics-realtime-report",
  description:
    "Who is on the site/app right now: a GA4 realtime report over the last 30 " +
    "minutes (not cached by Google, separate quota). Metrics: activeUsers, " +
    "screenPageViews, eventCount, keyEvents. Dimensions (≤2): minutesAgo, " +
    "unifiedScreenName, country, city, deviceCategory, platform, eventName, " +
    "audienceName. Use for 'right now' / 'live' questions only.",
  inputSchema: z.object({
    propertyRowId: propertyRowIdSchema,
    dimensions: z
      .array(fieldNameSchema)
      .max(2)
      .default([])
      .describe(
        "Realtime dimension API names (0–2). Omit for the headline total.",
      ),
    metrics: z
      .array(fieldNameSchema)
      .min(1)
      .max(3)
      .default(["activeUsers"])
      .describe('Realtime metric API names (1–3), default ["activeUsers"].'),
    limit: z.number().int().min(1).max(REALTIME_MAX_ROWS).default(10),
  }),
  execute: async (input, context) => {
    const authorized = authorizeProperty(
      input.propertyRowId,
      context?.requestContext,
    );
    if (!authorized.ok) {
      return authorized;
    }
    const access = requireGateway();
    if (!access.ok) {
      return access;
    }

    const dimensions = input.dimensions ?? [];
    const metrics = input.metrics ?? ["activeUsers"];

    const outcome = await access.gateway.runRealtimeReport(
      authorized.property.propertyRowId,
      {
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        minuteRanges: [{ startMinutesAgo: 29 }],
        ...(dimensions.length > 0
          ? { orderBys: [{ metric: { metricName: metrics[0] }, desc: true }] }
          : {}),
        limit: input.limit ?? 10,
      },
    );
    if (!outcome.ok) {
      return failureFromGateway(outcome.error);
    }

    const report = outcome.value;
    return {
      ok: true as const,
      property: {
        brandName: authorized.property.brandName,
        displayName: authorized.property.displayName,
      },
      window: "last 30 minutes",
      fetchedAt: new Date().toISOString(),
      rows: flattenRows(report, report.rows),
      totals: flattenRows(report, report.totals, { skipEmptyDimensions: true }),
    };
  },
});

export const searchGoogleAnalyticsFields = createTool({
  id: "search-google-analytics-fields",
  description:
    "Look up GA4 dimension and metric API names available on a property " +
    "(standard and custom), matching a word in the name, label or description " +
    `— e.g. "campaign", "revenue", "scroll". Returns at most ${FIELD_SEARCH_MAX_HITS} hits. ` +
    "Use it before runGoogleAnalyticsReport when unsure of a field name, or " +
    "after INVALID_ARGUMENT.",
  inputSchema: z.object({
    propertyRowId: propertyRowIdSchema,
    query: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .describe("Word or fragment to search for (case-insensitive)."),
    kind: z
      .enum(["dimensions", "metrics", "both"])
      .default("both")
      .describe("Restrict to dimensions or metrics; default both."),
  }),
  execute: async ({ propertyRowId, query, kind }, context) => {
    const authorized = authorizeProperty(
      propertyRowId,
      context?.requestContext,
    );
    if (!authorized.ok) {
      return authorized;
    }
    const access = requireGateway();
    if (!access.ok) {
      return access;
    }

    const outcome = await access.gateway.getMetadata(
      authorized.property.propertyRowId,
    );
    if (!outcome.ok) {
      return failureFromGateway(outcome.error);
    }

    const needle = query.trim().toLowerCase();
    const matches = (entry: {
      apiName: string;
      uiName?: string;
      description?: string;
      category?: string;
    }) =>
      [entry.apiName, entry.uiName, entry.description, entry.category].some(
        (text) => text?.toLowerCase().includes(needle),
      );

    const wantKind = kind ?? "both";
    const dimensions =
      wantKind === "metrics"
        ? []
        : (outcome.value.dimensions ?? []).filter(matches);
    const metrics =
      wantKind === "dimensions"
        ? []
        : (outcome.value.metrics ?? []).filter(matches);

    const total = dimensions.length + metrics.length;
    const dimensionBudget = Math.min(
      dimensions.length,
      Math.ceil(FIELD_SEARCH_MAX_HITS / 2) +
        Math.max(0, Math.floor(FIELD_SEARCH_MAX_HITS / 2) - metrics.length),
    );
    const metricBudget = Math.min(
      metrics.length,
      FIELD_SEARCH_MAX_HITS - dimensionBudget,
    );

    const describe = (text: string | undefined) =>
      text && text.length > 160 ? `${text.slice(0, 157)}…` : (text ?? "");

    return {
      ok: true as const,
      query,
      totalMatches: total,
      truncated: total > dimensionBudget + metricBudget,
      dimensions: dimensions.slice(0, dimensionBudget).map((entry) => ({
        apiName: entry.apiName,
        uiName: entry.uiName ?? entry.apiName,
        description: describe(entry.description),
        custom: entry.customDefinition ?? false,
      })),
      metrics: metrics.slice(0, metricBudget).map((entry) => ({
        apiName: entry.apiName,
        uiName: entry.uiName ?? entry.apiName,
        description: describe(entry.description),
        type: entry.type ?? null,
        custom: entry.customDefinition ?? false,
      })),
    };
  },
});

/** Tools spread into the Google Analytics agent (`tools: { ...googleAnalyticsTools }`). */
export const googleAnalyticsTools = {
  listGoogleAnalyticsProperties,
  getGoogleAnalyticsOverview,
  runGoogleAnalyticsReport,
  runGoogleAnalyticsRealtimeReport,
  searchGoogleAnalyticsFields,
};
