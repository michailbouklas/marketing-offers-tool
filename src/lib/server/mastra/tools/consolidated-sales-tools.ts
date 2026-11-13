import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  WEEKDAY_OPTIONS,
  type ConsolidatedReport,
  type ConsolidatedTotals,
} from "../../../services/sales-consolidated";
import {
  isIsoDate,
  SALES_DASHBOARD_MAX_DAYS,
} from "../../../services/sales-dashboard";
import { BRAND_SCOPE_RUNTIME_KEY } from "../chat-registry";
import {
  getConsolidatedSalesGateway,
  type ConsolidatedResolvedFilters,
  type ConsolidatedSalesGateway,
  type ConsolidatedSalesQuery,
} from "./consolidated-sales-gateway";
import type { ForecastGatewayError } from "./forecast-gateway";

/**
 * Typed tools for the Consolidated Sales Assistant
 * (agents/consolidated-sales-agent.ts). They call the same services and pure
 * builder as /sales/consolidated-sales-report, so answers equal the page.
 *
 * Every tool authorises the requested brands against the brand scope the chat
 * endpoint published in the RequestContext (fails closed when missing), reaches
 * the warehouse only through the injected gateway, and returns
 * `{ ok: true, … } | { ok: false, code, error }` without throwing.
 */

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

/** Store lines / options one call may return. */
export const MAX_ROWS = 200;
const MAX_FILTER_VALUES = 50;

export type RequestContextLike = { get(key: string): unknown };

// ---------------------------------------------------------------------------
// Brand scope (hard guardrail, not only a prompt rule)
// ---------------------------------------------------------------------------

/** Lowercase aliases of the caller's scope, or a failure (fails closed). */
export function resolveScope(
  requestContext: RequestContextLike | undefined,
): { ok: true; aliases: string[] } | ToolFailure {
  const raw = requestContext?.get(BRAND_SCOPE_RUNTIME_KEY);
  if (!Array.isArray(raw)) {
    return fail(
      "SCOPE_MISSING",
      "Brand scope is missing for this request — nothing was run. Tell the " +
        "user their sales cannot be accessed right now.",
    );
  }
  const aliases = [
    ...new Set(
      raw
        .filter((entry): entry is string => typeof entry === "string")
        .map((alias) => alias.trim().toLowerCase())
        .filter((alias) => alias.length > 0),
    ),
  ];
  if (aliases.length === 0) {
    return fail(
      "NO_BRANDS",
      "The current user has no assigned brands — no sales are available to " +
        "them. Do not call any tool.",
    );
  }
  return { ok: true, aliases };
}

/**
 * Checks every requested alias against the scope. Empty request = all scoped
 * brands. Any out-of-scope alias refuses the whole call.
 */
export function authorizeBrands(
  requested: string[] | undefined,
  requestContext: RequestContextLike | undefined,
): { ok: true; scope: string[]; brands: string[] } | ToolFailure {
  const scope = resolveScope(requestContext);
  if (!scope.ok) return scope;
  const allowed = new Set(scope.aliases);
  const brands = [
    ...new Set((requested ?? []).map((alias) => alias.trim().toLowerCase())),
  ].filter((alias) => alias.length > 0);
  const denied = brands.filter((alias) => !allowed.has(alias));
  if (denied.length > 0) {
    return fail(
      "FORBIDDEN",
      `The brand "${denied.join(", ")}" is not among the user's assigned brands. ` +
        `Do not retry with another alias. Reply exactly: ${REFUSAL_SENTENCE}`,
    );
  }
  return { ok: true, scope: scope.aliases, brands };
}

export function requireGateway():
  | { ok: true; gateway: ConsolidatedSalesGateway }
  | ToolFailure {
  const gateway = getConsolidatedSalesGateway();
  if (!gateway) {
    return fail(
      "GATEWAY_UNAVAILABLE",
      "Consolidated sales tools are only available inside the marketing tool " +
        "(no gateway is installed in this runtime). Tell the user live sales " +
        "are unavailable here.",
    );
  }
  return { ok: true, gateway };
}

function failureFromGateway(error: ForecastGatewayError): ToolFailure {
  return fail(error.code, error.message, error.retryable);
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

const isoDateSchema = z
  .string()
  .trim()
  .refine(isIsoDate, { message: "Dates must be real ISO dates (YYYY-MM-DD)." });

const brandsSchema = z
  .array(z.string().trim().min(1).max(64))
  .max(MAX_FILTER_VALUES)
  .default([])
  .describe(
    "Brand aliases from the Brand scope section. Empty = every brand in scope.",
  );

const valuesSchema = (what: string) =>
  z
    .array(z.string().trim().min(1).max(100))
    .max(MAX_FILTER_VALUES)
    .default([])
    .describe(
      `${what}; empty = all. Use exact values from getConsolidatedOptions.`,
    );

const baseShape = {
  brands: brandsSchema,
  from: isoDateSchema
    .optional()
    .describe(
      "Start date YYYY-MM-DD. Omit both dates for the page default (last 30 days to the latest loaded day).",
    ),
  to: isoDateSchema.optional().describe("End date YYYY-MM-DD (inclusive)."),
};

const dateRangeRefinement = (
  input: { from?: string; to?: string },
  ctx: z.RefinementCtx,
) => {
  if (!input.from || !input.to) return;
  if (input.from > input.to) {
    ctx.addIssue({ code: "custom", message: "from must be on or before to." });
    return;
  }
  const days =
    (Date.parse(`${input.to}T00:00:00Z`) -
      Date.parse(`${input.from}T00:00:00Z`)) /
      DAY_MS +
    1;
  if (days > SALES_DASHBOARD_MAX_DAYS) {
    ctx.addIssue({
      code: "custom",
      message: `A range may cover at most ${SALES_DASHBOARD_MAX_DAYS} days (same cap as the page). Split it into several calls.`,
    });
  }
};

/** Exported for tests (Mastra exposes `inputSchema` as a StandardSchema only). */
export const optionsInputSchema = z
  .object(baseShape)
  .superRefine(dateRangeRefinement);

export const reportInputSchema = z
  .object({
    ...baseShape,
    channels: valuesSchema(
      "Sales channels (dim_division_group_channel, e.g. Wolt, Foody, Take Away)",
    ),
    stores: valuesSchema("Store codes (store_bi_name, the `store` field)"),
    cities: valuesSchema("Cities (dim_store.district)"),
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .max(7)
      .default([])
      .describe("ISO weekdays, 1 = Monday … 7 = Sunday; empty = every day."),
    groupBy: z
      .enum(["company", "store", "city"])
      .default("company")
      .describe(
        "company = the page layout (company subtotals with their stores); store = flat store ranking by net; city = totals per city.",
      ),
  })
  .superRefine(dateRangeRefinement);

type OptionsInput = z.input<typeof optionsInputSchema>;
type ReportInput = z.input<typeof reportInputSchema>;

function toQuery(
  scope: string[],
  brands: string[],
  input: Partial<ReportInput>,
): ConsolidatedSalesQuery {
  return {
    scopeBrands: scope,
    brands,
    from: input.from ?? null,
    to: input.to ?? null,
    channels: [...new Set(input.channels ?? [])],
    stores: [...new Set(input.stores ?? [])],
    cities: [...new Set(input.cities ?? [])],
    // Same normalisation as parseConsolidatedExtras.
    weekdays: [...new Set(input.weekdays ?? [])].sort((a, b) => a - b),
  };
}

/** Explains any difference between the dates asked for and the dates run. */
function dateNote(
  input: { from?: string; to?: string },
  filters: ConsolidatedResolvedFilters,
): string | null {
  if (!input.from && !input.to) {
    return `No dates given: used the page default ${filters.from} to ${filters.to}.`;
  }
  if (input.from !== filters.from || input.to !== filters.to) {
    return `Ran ${filters.from} to ${filters.to} (missing dates defaulted, range capped at ${SALES_DASHBOARD_MAX_DAYS} days).`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------------

const money = (value: number) => Math.round(value * 100) / 100;
const maybeMoney = (value: number | null) =>
  value === null ? null : money(value);

function compactTotals(total: ConsolidatedTotals) {
  return {
    trans: total.trans,
    gross: money(total.gross),
    discount: money(total.discount),
    net: money(total.net),
    avgGross: maybeMoney(total.avgGross),
    avgNet: maybeMoney(total.avgNet),
  };
}

type StoreLine = ReturnType<typeof compactTotals> & {
  store: string;
  location: string;
  city: string;
  company: string;
};

function storeLines(report: ConsolidatedReport): StoreLine[] {
  return report.groups.flatMap((group) =>
    group.rows.map((row) => ({
      store: row.store,
      location: row.location,
      city: row.city,
      company: group.label,
      ...compactTotals(row),
    })),
  );
}

function byCity(report: ConsolidatedReport) {
  const cities = new Map<
    string,
    {
      stores: number;
      trans: number;
      gross: number;
      discount: number;
      net: number;
    }
  >();
  for (const row of report.groups.flatMap((group) => group.rows)) {
    const key = row.city || "(no city)";
    const acc = cities.get(key) ?? {
      stores: 0,
      trans: 0,
      gross: 0,
      discount: 0,
      net: 0,
    };
    acc.stores += 1;
    acc.trans += row.trans;
    acc.gross += row.gross;
    acc.discount += row.discount;
    acc.net += row.net;
    cities.set(key, acc);
  }
  return [...cities.entries()]
    .map(([city, acc]) => ({
      city,
      stores: acc.stores,
      ...compactTotals({
        ...acc,
        avgGross: acc.trans === 0 ? null : acc.gross / acc.trans,
        avgNet: acc.trans === 0 ? null : acc.net / acc.trans,
      }),
    }))
    .sort((a, b) => b.net - a.net);
}

/** The report shaped for `groupBy`, capped at MAX_ROWS store lines. */
export function compactReport(
  report: ConsolidatedReport,
  groupBy: "company" | "store" | "city",
) {
  const storeCount = report.groups.reduce(
    (count, group) => count + group.rows.length,
    0,
  );
  const grandTotal = compactTotals(report.total);

  if (groupBy === "city") {
    const cities = byCity(report);
    return {
      groupBy,
      storeCount,
      cities: cities.slice(0, MAX_ROWS),
      truncated: cities.length > MAX_ROWS,
      grandTotal,
    };
  }

  if (groupBy === "store") {
    const lines = storeLines(report).sort((a, b) => b.net - a.net);
    return {
      groupBy,
      storeCount,
      stores: lines.slice(0, MAX_ROWS),
      truncated: lines.length > MAX_ROWS,
      grandTotal,
    };
  }

  let budget = MAX_ROWS;
  const companies = report.groups.map((group) => {
    const rows = group.rows.slice(0, Math.max(0, budget));
    budget -= rows.length;
    return {
      company: group.label,
      companyCode: group.company,
      subtotal: compactTotals(group.total),
      storeCount: group.rows.length,
      stores: rows.map((row) => ({
        store: row.store,
        location: row.location,
        city: row.city,
        ...compactTotals(row),
      })),
    };
  });
  return {
    groupBy,
    storeCount,
    companies,
    truncated: storeCount > MAX_ROWS,
    grandTotal,
  };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const getConsolidatedOptions = createTool({
  id: "get-consolidated-options",
  description:
    "Filter values available on the Consolidated Sales Report for the given " +
    "brands and date range: sales channels, stores (store code, location " +
    "name, city), cities and weekdays. Use it to map a name the user typed " +
    "(a store, city or channel) to the exact value getConsolidatedReport " +
    "expects.",
  inputSchema: optionsInputSchema,
  execute: async (input: OptionsInput, context) => {
    const authorized = authorizeBrands(input.brands, context?.requestContext);
    if (!authorized.ok) return authorized;
    const access = requireGateway();
    if (!access.ok) return access;

    const outcome = await access.gateway.getOptions(
      toQuery(authorized.scope, authorized.brands, input),
    );
    if (!outcome.ok) return failureFromGateway(outcome.error);

    const { filters, options } = outcome.value;
    return {
      ok: true as const,
      filters,
      note: dateNote(input, filters),
      channels: options.channels,
      cities: options.cities,
      stores: options.stores.slice(0, MAX_ROWS),
      storesTruncated: options.stores.length > MAX_ROWS,
      weekdays: WEEKDAY_OPTIONS,
    };
  },
});

export const getConsolidatedReport = createTool({
  id: "get-consolidated-report",
  description:
    "The Consolidated Sales Report exactly as the page computes it: per " +
    "store transactions, gross, discount, net (excl. VAT) and average gross / " +
    "net per transaction, with company subtotals and a grand total. Filters: " +
    "brands, date range, channels, stores, cities, weekdays. groupBy: " +
    "company (page layout), store (ranking by net) or city. To compare " +
    "periods (e.g. vs last year) call it once per range and compute the " +
    `deltas yourself. At most ${MAX_ROWS} store lines are returned.`,
  inputSchema: reportInputSchema,
  execute: async (input: ReportInput, context) => {
    const authorized = authorizeBrands(input.brands, context?.requestContext);
    if (!authorized.ok) return authorized;
    const access = requireGateway();
    if (!access.ok) return access;

    const query = toQuery(authorized.scope, authorized.brands, input);
    const outcome = await access.gateway.getReport(query);
    if (!outcome.ok) return failureFromGateway(outcome.error);

    const { filters, report } = outcome.value;
    return {
      ok: true as const,
      filters: {
        ...filters,
        channels: query.channels,
        stores: query.stores,
        cities: query.cities,
        weekdays: query.weekdays,
      },
      note:
        report.groups.length === 0
          ? "No sales match these filters. Say so instead of reporting zero."
          : dateNote(input, filters),
      ...compactReport(report, input.groupBy ?? "company"),
    };
  },
});

/** Tools spread into the Consolidated Sales agent. */
export const consolidatedSalesTools = {
  getConsolidatedOptions,
  getConsolidatedReport,
};
