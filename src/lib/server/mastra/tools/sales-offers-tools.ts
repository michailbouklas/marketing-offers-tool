import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  isIsoDate,
  SALES_DASHBOARD_MAX_DAYS,
} from "../../../services/sales-dashboard";
import type {
  OfferCalendarRow,
  OfferDateRange,
  OfferValue,
  OfferVerdict,
} from "../../../services/sales-offers";
import { BRAND_SCOPE_RUNTIME_KEY } from "../chat-registry";
import type { ForecastGatewayError } from "./forecast-gateway";
import {
  getSalesOffersGateway,
  type OfferFilters,
  type SalesOffersGateway,
} from "./sales-offers-gateway";

/**
 * Typed tools for the Offers Value Assistant (agents/sales-offers-agent.ts).
 *
 * Every tool authorises the model-supplied brand against the brand scope the
 * chat endpoint published in the RequestContext (fails closed), reaches the
 * /sales/offers services through the injected {@link SalesOffersGateway}, and
 * returns `{ ok: true, … } | { ok: false, code, error }` without throwing.
 * Money is rounded to cents and rows are capped, so the model relays numbers
 * instead of computing them.
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
export const MAX_ROWS = 200;
export const DEFAULT_ROWS = 50;
/** Live (ClickHouse) ranges are capped like the other sales pages; all time comes from the cache. */
export const MAX_RANGE_DAYS = SALES_DASHBOARD_MAX_DAYS;
/** Weeks returned per offer by compareOffers (most recent kept). */
export const MAX_WEEKS = 60;

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export type RequestContextLike = { get(key: string): unknown };

/** Resolves a model-supplied alias against the published brand scope; fails closed. */
export function authorizeBrand(
  brand: string,
  requestContext: RequestContextLike | undefined,
): { ok: true; brand: string } | ToolFailure {
  const raw = requestContext?.get(BRAND_SCOPE_RUNTIME_KEY);
  if (!Array.isArray(raw)) {
    return fail(
      "SCOPE_MISSING",
      "Brand scope is missing for this request — nothing was run. Tell the " +
        "user their offer figures cannot be accessed right now.",
    );
  }
  const aliases = raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((alias) => alias.trim().toLowerCase());
  const wanted = brand.trim().toLowerCase();
  if (!aliases.includes(wanted)) {
    return fail(
      "FORBIDDEN",
      `The brand "${brand}" is not among the user's assigned brands. ` +
        `Do not retry with another alias. Reply exactly: ${REFUSAL_SENTENCE}`,
    );
  }
  return { ok: true, brand: wanted };
}

function requireGateway():
  | { ok: true; gateway: SalesOffersGateway }
  | ToolFailure {
  const gateway = getSalesOffersGateway();
  return gateway
    ? { ok: true, gateway }
    : fail(
        "GATEWAY_UNAVAILABLE",
        "Offer tools are only available inside the marketing tool (no " +
          "sales-offers gateway is installed in this runtime). Tell the user " +
          "offer figures are unavailable here.",
      );
}

const fromGateway = (error: ForecastGatewayError): ToolFailure =>
  fail(error.code, error.message, error.retryable);

/** Both ends or neither; reversed ends swapped (parseOfferDateRange). */
export function toRange(
  from: string | null | undefined,
  to: string | null | undefined,
): { ok: true; range: OfferDateRange | null } | ToolFailure {
  if (!from && !to) return { ok: true, range: null };
  if (!from || !to) {
    return fail(
      "INVALID_RANGE",
      "Pass both from and to (YYYY-MM-DD), or neither for all time.",
    );
  }
  const range = from <= to ? { from, to } : { from: to, to: from };
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 + 1;
  if (days > MAX_RANGE_DAYS) {
    return fail(
      "RANGE_TOO_LONG",
      `Date ranges are capped at ${MAX_RANGE_DAYS} days. Narrow the range, or ` +
        "omit from/to (and channels/locations) for all-time figures from the cache.",
    );
  }
  return { ok: true, range };
}

/**
 * Checks channels (case-insensitive, canonicalised) and location ids against
 * the brand's options; requires a range when either is set, because the cache
 * holds all channels/locations only and a live all-time scan is too slow.
 */
async function resolveFilters(
  gateway: SalesOffersGateway,
  brand: string,
  range: OfferDateRange | null,
  channels: string[] | null = [],
  locations: number[] | null = [],
): Promise<{ ok: true; filters: OfferFilters } | ToolFailure> {
  channels ??= [];
  locations ??= [];
  if (channels.length === 0 && locations.length === 0) {
    return { ok: true, filters: { range, channels: [], locations: [] } };
  }
  if (!range) {
    return fail(
      "RANGE_REQUIRED",
      "Channel and location filters need a date range (from/to): all-time " +
        "figures exist only for all channels and locations. Ask the user for a " +
        "range or suggest a recent one.",
    );
  }
  const options = await gateway.listFilterOptions(brand, null);
  if (!options.ok) return fromGateway(options.error);

  const canonical: string[] = [];
  for (const channel of channels) {
    const match = options.value.channels.find(
      (option) => option.toLowerCase() === channel.trim().toLowerCase(),
    );
    if (!match) {
      return fail(
        "UNKNOWN_CHANNEL",
        `"${channel}" is not a channel of ${brand}. Known: ${options.value.channels.join(", ")}.`,
      );
    }
    canonical.push(match);
  }
  const unknown = locations.filter(
    (id) => !options.value.locations.some((option) => option.id === id),
  );
  if (unknown.length > 0) {
    return fail(
      "UNKNOWN_LOCATION",
      `Location ids ${unknown.join(", ")} are not stores of ${brand}. Call listOfferFilterOptions for the ids.`,
    );
  }
  return {
    ok: true,
    filters: { range, channels: [...new Set(canonical)], locations },
  };
}

// ---------------------------------------------------------------------------
// Compact output
// ---------------------------------------------------------------------------

const r2 = (value: number) => Math.round(value * 100) / 100;
const r2n = (value: number | null | undefined) =>
  value === null || value === undefined ? null : r2(value);
/** Fraction -> percent with one decimal. */
const pct = (value: number | null) =>
  value === null ? null : Math.round(value * 1000) / 10;

export function compactOffer(offer: OfferValue) {
  return {
    code: offer.code,
    name: offer.name,
    channel: offer.channel,
    category: offer.category,
    firstSale: offer.firstSale,
    lastSale: offer.lastSale,
    daysOnSale: offer.daysOnSale,
    units: r2(offer.units),
    orders: offer.orders,
    qtyPerTxn: offer.orders > 0 ? r2(offer.units / offer.orders) : null,
    offerNet: r2(offer.offerNet),
    discountGiven: r2n(offer.discountGiven),
    foodCost: r2n(offer.foodCost),
    addonNet: r2(offer.addonNet),
    addonPerOrder: offer.orders > 0 ? r2(offer.addonNet / offer.orders) : 0,
    contribution: r2n(offer.contribution),
    marginPercent: pct(offer.marginPct),
    verdict: offer.verdict,
  };
}

const VERDICTS = [
  "positive",
  "below_target",
  "loss",
  "no_cost",
  "no_target",
] as const satisfies readonly OfferVerdict[];

const SORT_KEYS = [
  "contribution",
  "marginPct",
  "offerNet",
  "units",
  "qtyPerTxn",
  "discountGiven",
  "foodCost",
  "addonPerOrder",
  "daysOnSale",
  "lastSale",
  "name",
] as const;
type SortKey = (typeof SORT_KEYS)[number];

/** Page sort: unknown values sink to the bottom either way. */
function sortOffers(offers: OfferValue[], key: SortKey, desc: boolean) {
  const value = (offer: OfferValue): string | number | null => {
    if (key === "qtyPerTxn")
      return offer.orders > 0 ? offer.units / offer.orders : null;
    if (key === "addonPerOrder")
      return offer.orders > 0 ? offer.addonNet / offer.orders : 0;
    return offer[key] ?? null;
  };
  const sign = desc ? -1 : 1;
  return [...offers].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return x < y ? -sign : x > y ? sign : 0;
  });
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const brandSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .describe(
    "Brand alias (e.g. 'phcy') — one of the brands in the Brand scope section; default: the page's brand.",
  );
const isoDate = z
  .string()
  .refine(isIsoDate, "Use a valid YYYY-MM-DD date")
  .describe("YYYY-MM-DD");
// Every optional input is also nullable: OpenAI strict tool schemas make the
// model send each key, and null is how it says "no filter / default".
const channelsSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(20)
  .nullable()
  .optional()
  .describe(
    "Sales channel names (e.g. 'Wolt'); null = all channels. Needs from/to. Names from listOfferFilterOptions.",
  );
const locationsSchema = z
  .array(z.number().int().min(1).max(32_767))
  .max(200)
  .nullable()
  .optional()
  .describe(
    "POS location ids; null = all locations. Needs from/to. Ids from listOfferFilterOptions.",
  );

const filterShape = {
  brand: brandSchema,
  from: isoDate
    .nullable()
    .optional()
    .describe("Range start YYYY-MM-DD; null from AND to = all time."),
  to: isoDate
    .nullable()
    .optional()
    .describe("Range end YYYY-MM-DD (inclusive); null = all time."),
  channels: channelsSchema,
  locations: locationsSchema,
};

export const MAX_CODES = 20;

export const getOfferValuesInputSchema = z.object({
  ...filterShape,
  codes: z
    .array(z.string().trim().min(1).max(64))
    .max(MAX_CODES)
    .nullable()
    .optional()
    .describe(
      `Exact offer codes to return (up to ${MAX_CODES}) — use this to fetch several named offers in ONE call. null = all offers.`,
    ),
  verdict: z
    .enum(VERDICTS)
    .nullable()
    .optional()
    .describe(
      "Only offers with this verdict (the page's verdict badges). null = all verdicts — use null unless the user asks for one verdict.",
    ),
  search: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional()
    .describe(
      "Case-insensitive substring of the offer name or code; null = no search.",
    ),
  sortBy: z
    .enum(SORT_KEYS)
    .nullable()
    .optional()
    .describe("Sort column; null = contribution (like the page)."),
  ascending: z
    .boolean()
    .nullable()
    .optional()
    .describe("Sort ascending; null = false (biggest first)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_ROWS)
    .nullable()
    .optional()
    .describe(`Rows to return; null = ${DEFAULT_ROWS}.`),
});

export const compareOffersInputSchema = z.object({
  ...filterShape,
  codes: z
    .array(z.string().trim().min(1).max(64))
    .min(1)
    .max(2)
    .describe(
      "One offer code (detail: reason, weekday mix, weekly curve) or two (Offer VS).",
    ),
});

const requiredRangeShape = {
  brand: brandSchema,
  from: isoDate.describe(
    "Range start YYYY-MM-DD (page default: last 30 days).",
  ),
  to: isoDate.describe("Range end YYYY-MM-DD (inclusive)."),
  channels: channelsSchema,
  locations: locationsSchema,
};

export const getOfferSlotSalesInputSchema = z.object({
  ...requiredRangeShape,
  date: isoDate
    .nullable()
    .optional()
    .describe("One business day (instead of weekday); else null."),
  weekday: z
    .number()
    .int()
    .min(1)
    .max(7)
    .nullable()
    .optional()
    .describe("ISO weekday 1 = Monday … 7 = Sunday; null when date is set."),
  hour: z
    .number()
    .int()
    .min(0)
    .max(23)
    .nullable()
    .optional()
    .describe(
      "Order hour 0-23 (local Cyprus time), only with weekday; null = whole day.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_ROWS)
    .nullable()
    .optional()
    .describe("Rows to return; null = 20."),
});

// ---------------------------------------------------------------------------
// Shared preamble: scope -> gateway -> range -> filters
// ---------------------------------------------------------------------------

async function prepare(
  input: {
    brand: string;
    from?: string | null;
    to?: string | null;
    channels?: string[] | null;
    locations?: number[] | null;
  },
  requestContext: RequestContextLike | undefined,
): Promise<
  | {
      ok: true;
      brand: string;
      gateway: SalesOffersGateway;
      filters: OfferFilters;
    }
  | ToolFailure
> {
  const authorized = authorizeBrand(input.brand, requestContext);
  if (!authorized.ok) return authorized;
  const access = requireGateway();
  if (!access.ok) return access;
  const range = toRange(input.from, input.to);
  if (!range.ok) return range;
  const resolved = await resolveFilters(
    access.gateway,
    authorized.brand,
    range.range,
    input.channels,
    input.locations,
  );
  if (!resolved.ok) return resolved;
  return {
    ok: true,
    brand: authorized.brand,
    gateway: access.gateway,
    filters: resolved.filters,
  };
}

const describeFilters = (brand: string, filters: OfferFilters) => ({
  brand,
  range: filters.range ?? "all time",
  channels: filters.channels.length ? filters.channels : "all",
  locations: filters.locations.length ? filters.locations : "all",
});

const CACHE_EMPTY = fail(
  "CACHE_EMPTY",
  "The all-time offer figures for this brand have not been computed yet. Tell " +
    "the user to open /sales/offers (it builds them) or press Refresh there, " +
    "or ask a question over a date range instead.",
);

type ToolContext = { requestContext?: RequestContextLike } | undefined;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const listOfferFilterOptions = createTool({
  id: "list-offer-filter-options",
  description:
    "Sales channels (e.g. Wolt, Bolt, Foody, dine-in) and POS locations (id + " +
    "store name) of a brand, over its whole history or inside from/to. Use it " +
    "to turn a store or channel the user names into the exact value the other " +
    "tools need.",
  inputSchema: z.object({
    brand: brandSchema,
    from: isoDate.nullable().optional().describe("null = all history."),
    to: isoDate.nullable().optional().describe("null = all history."),
  }),
  execute: async ({ brand, from, to }, context) => {
    const authorized = authorizeBrand(
      brand,
      (context as ToolContext)?.requestContext,
    );
    if (!authorized.ok) return authorized;
    const access = requireGateway();
    if (!access.ok) return access;
    const range = toRange(from, to);
    if (!range.ok) return range;
    const options = await access.gateway.listFilterOptions(
      authorized.brand,
      range.range,
    );
    if (!options.ok) return fromGateway(options.error);
    return {
      ok: true as const,
      brand: authorized.brand,
      range: range.range ?? "all time",
      channels: options.value.channels,
      locations: options.value.locations,
    };
  },
});

export const getOfferValues = createTool({
  id: "get-offer-values",
  description:
    "The /sales/offers table: every offer of one brand with units, orders, " +
    "offer net, discount given, food cost, add-on per order, contribution, " +
    "margin % and verdict (positive / below_target / loss / no_cost / " +
    "no_target), plus a summary (offers per verdict, totals). No from/to and " +
    "no channel/location = all time from the nightly cache (instant); any " +
    "filter = live, needs from/to. Use it for 'which offers lose money', " +
    "'top offers by contribution', 'how did <offer> do'. Pass null for every " +
    "filter you do not need (verdict null = all verdicts). For several named " +
    "offers, pass all their codes in ONE call via codes.",
  inputSchema: getOfferValuesInputSchema,
  execute: async (input, context) => {
    const ready = await prepare(
      input,
      (context as ToolContext)?.requestContext,
    );
    if (!ready.ok) return ready;
    const { gateway, brand, filters } = ready;

    const outcome = filters.range
      ? await gateway.getLiveOfferValues(brand, {
          ...filters,
          range: filters.range,
        })
      : await gateway.getCachedOfferValues(brand);
    if (!outcome.ok) return fromGateway(outcome.error);
    if (!outcome.value) return CACHE_EMPTY;

    const { offers } = outcome.value;
    const sum = (pick: (offer: OfferValue) => number | null) =>
      r2(offers.reduce((total, offer) => total + (pick(offer) ?? 0), 0));
    const query = input.search?.toLowerCase();
    const codes = input.codes?.length
      ? new Set(input.codes.map((code) => code.toLowerCase()))
      : null;
    const limit = input.limit ?? DEFAULT_ROWS;
    const matching = sortOffers(
      offers.filter(
        (offer) =>
          (!codes || codes.has(offer.code.toLowerCase())) &&
          (!input.verdict || offer.verdict === input.verdict) &&
          (!query ||
            offer.name.toLowerCase().includes(query) ||
            offer.code.toLowerCase().includes(query)),
      ),
      input.sortBy ?? "contribution",
      !input.ascending,
    );
    const missingCodes = codes
      ? [...codes].filter(
          (code) => !offers.some((offer) => offer.code.toLowerCase() === code),
        )
      : [];

    return {
      ok: true as const,
      filters: describeFilters(brand, filters),
      source: outcome.value.source,
      computedAt: outcome.value.computedAt,
      brandIdealFcPercent: pct(outcome.value.idealFcPerc),
      brandTargetMarginPercent:
        outcome.value.idealFcPerc === null
          ? null
          : pct(1 - outcome.value.idealFcPerc),
      summary: {
        offers: offers.length,
        byVerdict: Object.fromEntries(
          VERDICTS.map((verdict) => [
            verdict,
            offers.filter((offer) => offer.verdict === verdict).length,
          ]),
        ),
        units: sum((offer) => offer.units),
        offerNet: sum((offer) => offer.offerNet),
        addonNet: sum((offer) => offer.addonNet),
        discountGiven: sum((offer) => offer.discountGiven),
        // Only offers with a known value add up here (no_cost / no_target are excluded).
        foodCost: sum((offer) => offer.foodCost),
        contribution: sum((offer) => offer.contribution),
      },
      // summary covers every offer of the brand under these filters; rows only the matching ones.
      matching: matching.length,
      ...(codes ? { missingCodes } : {}),
      truncated: matching.length > limit,
      rows: matching.slice(0, limit).map(compactOffer),
    };
  },
});

export const compareOffers = createTool({
  id: "compare-offers",
  description:
    "One offer code: its valuation, the plain-language reason for its " +
    "verdict, its weekday mix (share of units Mon-Sun) and weekly curve. Two " +
    "codes: the page's Offer VS — per-active-day rates, margins and the " +
    "winner of each metric. Same filter rules as getOfferValues (no filters = " +
    "all time from the cache). Get the codes from getOfferValues first.",
  inputSchema: compareOffersInputSchema,
  execute: async (input, context) => {
    const ready = await prepare(
      input,
      (context as ToolContext)?.requestContext,
    );
    if (!ready.ok) return ready;
    const { gateway, brand, filters } = ready;

    const outcome = await gateway.compareOffers(
      brand,
      [...new Set(input.codes)],
      filters,
    );
    if (!outcome.ok) return fromGateway(outcome.error);
    if (!outcome.value) return CACHE_EMPTY;
    const value = outcome.value;

    return {
      ok: true as const,
      filters: describeFilters(brand, filters),
      source: value.source,
      computedAt: value.computedAt,
      brandTargetMarginPercent:
        value.idealFcPerc === null ? null : pct(1 - value.idealFcPerc),
      missing: value.missing,
      offers: value.offers.map((profile) => ({
        ...compactOffer(profile.value),
        reason: profile.reason,
        weekdayMixPercent: Object.fromEntries(
          profile.weekdayMix.map((share, i) => [WEEKDAYS[i], pct(share)]),
        ),
        weeksTruncated: profile.weeks.length > MAX_WEEKS,
        weeks: profile.weeks.slice(-MAX_WEEKS).map((week) => ({
          weekStart: week.weekStart,
          units: r2(week.units),
          orders: week.orders,
          net: r2(week.net),
          avgPrice: r2n(week.price),
        })),
      })),
      // a = first code found, b = second.
      metrics:
        value.metrics?.map((metric) => ({
          label: metric.label,
          kind: metric.kind,
          a: metric.kind === "percent" ? pct(metric.a) : r2n(metric.a),
          b: metric.kind === "percent" ? pct(metric.b) : r2n(metric.b),
          better: metric.better,
          winner: metric.winner,
        })) ?? null,
    };
  },
});

export const getOfferCalendar = createTool({
  id: "get-offer-calendar",
  description:
    "The page's Calendar tab: units and net of ALL offers of the brand " +
    "combined, by weekday, by order hour (local time), the 10 best weekday x " +
    "hour slots and the 10 best days. from/to required (the page defaults to " +
    "the last 30 days). For which offers sold in a slot, call getOfferSlotSales.",
  inputSchema: z.object(requiredRangeShape),
  execute: async (input, context) => {
    const ready = await prepare(
      input,
      (context as ToolContext)?.requestContext,
    );
    if (!ready.ok) return ready;
    const { gateway, brand, filters } = ready;
    const range = filters.range!;

    const outcome = await gateway.getOfferCalendarRows(brand, {
      ...filters,
      range,
    });
    if (!outcome.ok) return fromGateway(outcome.error);

    const rows = outcome.value;
    const fold = (key: (row: OfferCalendarRow) => string) => {
      const cells = new Map<string, { units: number; net: number }>();
      for (const row of rows) {
        const cell = cells.get(key(row)) ?? { units: 0, net: 0 };
        cell.units += row.units;
        cell.net += row.net;
        cells.set(key(row), cell);
      }
      return [...cells].map(([slot, cell]) => ({
        slot,
        units: r2(cell.units),
        net: r2(cell.net),
      }));
    };
    const top = (cells: ReturnType<typeof fold>) =>
      cells.sort((a, b) => b.net - a.net).slice(0, 10);

    const byWeekday = fold((row) => WEEKDAYS[row.weekday - 1]);
    return {
      ok: true as const,
      filters: describeFilters(brand, filters),
      totals: {
        units: r2(rows.reduce((s, row) => s + row.units, 0)),
        net: r2(rows.reduce((s, row) => s + row.net, 0)),
      },
      byWeekday: WEEKDAYS.map(
        (day) =>
          byWeekday.find((cell) => cell.slot === day) ?? {
            slot: day,
            units: 0,
            net: 0,
          },
      ),
      byHour: fold((row) => String(row.hour).padStart(2, "0")).sort((a, b) =>
        a.slot.localeCompare(b.slot),
      ),
      topWeekdayHours: top(
        fold(
          (row) =>
            `${WEEKDAYS[row.weekday - 1]} ${String(row.hour).padStart(2, "0")}:00`,
        ),
      ),
      topDays: top(fold((row) => row.day)),
    };
  },
});

export const getOfferSlotSales = createTool({
  id: "get-offer-slot-sales",
  description:
    "Which offers sold in one calendar cell: a date, a weekday, or a weekday " +
    "x order hour, best net first. Use it for 'what sells on Friday evenings' " +
    "or 'which offers did best on 2026-10-03'.",
  inputSchema: getOfferSlotSalesInputSchema,
  execute: async (input, context) => {
    const hour = input.hour ?? undefined;
    const limit = input.limit ?? 20;
    if (!input.date === !input.weekday || (input.date && hour !== undefined)) {
      return fail(
        "INVALID_SLOT",
        "Pass either date, or weekday (optionally with hour) — not both.",
      );
    }
    const ready = await prepare(
      input,
      (context as ToolContext)?.requestContext,
    );
    if (!ready.ok) return ready;
    const { gateway, brand, filters } = ready;

    // The service treats only undefined as "no hour": never pass null down.
    const slot = input.date
      ? { date: input.date }
      : { weekday: input.weekday ?? undefined, hour };
    const outcome = await gateway.getOfferSlotSales(
      brand,
      { ...filters, range: filters.range! },
      slot,
    );
    if (!outcome.ok) return fromGateway(outcome.error);

    return {
      ok: true as const,
      filters: describeFilters(brand, filters),
      slot,
      offers: outcome.value.length,
      truncated: outcome.value.length > limit,
      rows: outcome.value.slice(0, limit).map((row) => ({
        code: row.code,
        name: row.name,
        units: r2(row.units),
        orders: row.orders,
        net: r2(row.net),
      })),
    };
  },
});

export const salesOffersTools = {
  listOfferFilterOptions,
  getOfferValues,
  compareOffers,
  getOfferCalendar,
  getOfferSlotSales,
};
