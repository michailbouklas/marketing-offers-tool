import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { isIsoDate } from "../../../services/sales-dashboard";
import {
  DELIVERY_CHANNELS,
  type DeliveryTotals,
} from "../../../services/sales-delivery";
import { BRAND_SCOPE_RUNTIME_KEY } from "../chat-registry";
import type { ForecastGatewayError } from "./forecast-gateway";
import {
  getSalesDeliveryGateway,
  type SalesDeliveryGateway,
} from "./sales-delivery-gateway";

/**
 * Typed tools for the Delivery Assistant (agents/sales-delivery-agent.ts),
 * one per /sales/delivery widget group. Every tool:
 * - authorises the model-supplied brand against the scope the chat endpoint
 *   published in the RequestContext (fails closed when it is missing);
 * - reaches the page services through the injected gateway (fails closed
 *   when none is installed);
 * - returns `{ ok: true, … } | { ok: false, code, error }`, never throws,
 *   with money rounded to 2 decimals and at most MAX_ROWS rows per list.
 */

export type ToolFailure = {
  ok: false;
  code: string;
  error: string;
  retryable?: boolean;
};

const fail = (code: string, error: string, retryable = false): ToolFailure => ({
  ok: false,
  code,
  error,
  retryable,
});

/** The exact sentence the agent must reply with for an out-of-scope brand. */
export const REFUSAL_SENTENCE = "You're not assigned to this brand";
export const MAX_ROWS = 200;

export type RequestContextLike = { get(key: string): unknown };

/** Resolves the model-supplied alias against the published scope; fails closed. */
export function authorizeBrand(
  brand: string,
  requestContext: RequestContextLike | undefined,
): { ok: true; brand: string; scope: string[] } | ToolFailure {
  const raw = requestContext?.get(BRAND_SCOPE_RUNTIME_KEY);
  if (!Array.isArray(raw)) {
    return fail(
      "SCOPE_MISSING",
      "Brand scope is missing for this request — nothing was run. Tell the " +
        "user their delivery sales cannot be accessed right now.",
    );
  }
  const wanted = brand.trim().toLowerCase();
  const scope = raw
    .filter((alias): alias is string => typeof alias === "string")
    .map((alias) => alias.trim().toLowerCase());
  if (!scope.includes(wanted)) {
    return fail(
      "FORBIDDEN",
      `The brand "${brand}" is not among the user's assigned brands. ` +
        `Do not retry with another alias. Reply exactly: ${REFUSAL_SENTENCE}`,
    );
  }
  return { ok: true, brand: wanted, scope };
}

function requireGateway():
  | { ok: true; gateway: SalesDeliveryGateway }
  | ToolFailure {
  const gateway = getSalesDeliveryGateway();
  return gateway
    ? { ok: true, gateway }
    : fail(
        "GATEWAY_UNAVAILABLE",
        "Delivery sales tools are only available inside the marketing tool (no " +
          "gateway is installed in this runtime). Tell the user live delivery " +
          "data is unavailable here.",
      );
}

const fromGateway = (error: ForecastGatewayError) =>
  fail(
    error.code,
    `${error.message} Tell the user the delivery data could not be loaded; retry once at most.`,
    error.retryable,
  );

/** Auth then gateway, in that order: an unauthorised call never reaches the gateway. */
function access(brand: string, requestContext: RequestContextLike | undefined) {
  const authorized = authorizeBrand(brand, requestContext);
  if (!authorized.ok) return authorized;
  const gateway = requireGateway();
  if (!gateway.ok) return gateway;
  return {
    ok: true as const,
    brand: authorized.brand,
    scopedBrands: authorized.scope,
    gateway: gateway.gateway,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const money = (value: number) => Math.round(value * 100) / 100;
const moneyOrNull = (value: number | null | undefined) =>
  value === null || value === undefined ? null : money(value);
/** Fraction -> percent with one decimal (0.4567 -> 45.7). */
const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? null : Math.round(value * 1000) / 10;

function capped<T>(rows: T[], limit: number) {
  return {
    rows: rows.slice(0, limit),
    total: rows.length,
    truncated: rows.length > limit,
  };
}

const kpis = (totals: DeliveryTotals) => ({
  net: money(totals.net),
  gross: money(totals.gross),
  discount: money(totals.discount),
  orders: totals.orders,
  avgTicket: moneyOrNull(totals.atv),
});

// ---------------------------------------------------------------------------
// Input schemas (exported for tests)
// ---------------------------------------------------------------------------

const brandSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .describe("Brand alias from the Brand scope section (e.g. bk, kfc, phcy).");

const isoDateSchema = z
  .string()
  .trim()
  .refine(isIsoDate, { message: "Dates must be valid YYYY-MM-DD." });

const optionalRange = {
  from: isoDateSchema
    .nullable()
    .optional()
    .describe(
      "Start, YYYY-MM-DD. Null or omit for Jan 1 of the `to` year (page default).",
    ),
  to: isoDateSchema
    .nullable()
    .optional()
    .describe(
      "End, YYYY-MM-DD. Null or omit for the latest loaded day (page default).",
    ),
};

const channelSchema = z
  .enum(DELIVERY_CHANNELS as [string, ...string[]])
  .describe(`Delivery channel: ${DELIVERY_CHANNELS.join(", ")}.`);

const rangeRefine = <T extends { from?: string | null; to?: string | null }>(
  input: T,
) => !input.from || !input.to || input.from <= input.to;
const rangeMessage = { message: "`from` must be on or before `to`." };

export const deliveryOverviewInputSchema = z
  .object({
    brand: brandSchema,
    ...optionalRange,
    channel: channelSchema
      .nullable()
      .optional()
      .describe(
        "One delivery channel, or null for ALL delivery channels combined (the default; use it for overall delivery questions, never sum channels yourself).",
      ),
    includeDaily: z
      .boolean()
      .nullable()
      .default(false)
      .describe("Add the daily series (only when the user asks for days)."),
    topLocations: z
      .number()
      .int()
      .min(1)
      .max(MAX_ROWS)
      .nullable()
      .default(10)
      .describe(
        `Locations to list, biggest net first (1–${MAX_ROWS}, default 10).`,
      ),
  })
  .refine(rangeRefine, rangeMessage);

export const compareDeliveryChannelsInputSchema = z
  .object({
    brand: brandSchema,
    ...optionalRange,
    channels: z
      .array(channelSchema)
      .length(2)
      .nullable()
      .optional()
      .describe(
        "The two channels to compare; null or omit for the top two by net.",
      ),
  })
  .refine(rangeRefine, rangeMessage);

export const deliveryCampaignsInputSchema = z
  .object({ brand: brandSchema, ...optionalRange })
  .refine(rangeRefine, rangeMessage);

export const deliveryOfferValuesInputSchema = z
  .object({
    brand: brandSchema,
    channel: channelSchema.describe(
      "ONE delivery channel per call (the query is heavy).",
    ),
    from: isoDateSchema.describe("Start, YYYY-MM-DD (required)."),
    to: isoDateSchema.describe("End, YYYY-MM-DD (required)."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_ROWS)
      .nullable()
      .default(30)
      .describe(
        `Offers to list, biggest offer net first (1–${MAX_ROWS}, default 30).`,
      ),
  })
  .refine(rangeRefine, rangeMessage);

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const getDeliveryOverview = createTool({
  id: "get-delivery-overview",
  description:
    "The /sales/delivery Overview tab for one brand: net, orders, average " +
    "ticket, gross and discounts for the range AND month-to-date (month of " +
    "`to`), each channel's net and share of delivery net, monthly totals and " +
    "the top locations. Optional single channel. Daily rows only with " +
    "includeDaily. Use for 'how is delivery doing', 'share of Wolt', " +
    "'best location on Bolt', 'monthly trend'.",
  inputSchema: deliveryOverviewInputSchema,
  execute: async (input, context) => {
    const ready = access(input.brand, context?.requestContext);
    if (!ready.ok) return ready;

    const outcome = await ready.gateway.getOverview({
      brand: ready.brand,
      scopedBrands: ready.scopedBrands,
      from: input.from ?? null,
      to: input.to ?? null,
      channel: input.channel ?? null,
    });
    if (!outcome.ok) return fromGateway(outcome.error);

    const { range, dashboard } = outcome.value;
    const locations = capped(dashboard.locations, input.topLocations ?? 10);
    const daily = input.includeDaily ? capped(dashboard.daily, MAX_ROWS) : null;
    return {
      ok: true as const,
      brand: ready.brand,
      range,
      channel: input.channel ?? "all delivery channels",
      kpis: { range: kpis(dashboard.range), mtd: kpis(dashboard.mtd) },
      mtdFrom: `${range.to.slice(0, 8)}01`,
      channelShares: dashboard.channels.map((row) => ({
        channel: row.channel,
        net: money(row.net),
        sharePct: pct(row.share),
      })),
      monthly: dashboard.monthly.map((row) => ({
        month: row.month.slice(0, 7),
        net: money(row.net),
        orders: row.orders,
      })),
      locations: {
        rows: locations.rows.map((row) => ({
          location: row.location,
          net: money(row.net),
          orders: row.orders,
          avgTicket: moneyOrNull(row.atv),
          sharePct: pct(row.share),
        })),
        total: locations.total,
        truncated: locations.truncated,
      },
      daily: daily && {
        rows: daily.rows.map((row) => ({
          day: row.day,
          net: money(row.net),
          orders: row.orders,
          avgTicket: moneyOrNull(row.atv),
        })),
        total: daily.total,
        truncated: daily.truncated,
      },
    };
  },
});

export const compareDeliveryChannels = createTool({
  id: "compare-delivery-channels",
  description:
    "The /sales/delivery Channel VS tab: two delivery channels head to head " +
    "for one brand — net, orders, average ticket, share of delivery net, " +
    "discount rate (discount / gross), MTD net, a weekly net + avg-ticket " +
    "series and net per location. Omit channels for the top two by net.",
  inputSchema: compareDeliveryChannelsInputSchema,
  execute: async (input, context) => {
    const ready = access(input.brand, context?.requestContext);
    if (!ready.ok) return ready;

    const requested = input.channels ?? [];
    const outcome = await ready.gateway.compareChannels({
      brand: ready.brand,
      scopedBrands: ready.scopedBrands,
      from: input.from ?? null,
      to: input.to ?? null,
      channels: requested,
    });
    if (!outcome.ok) return fromGateway(outcome.error);

    const { range, vs } = outcome.value;
    const substituted =
      requested.length > 0 && requested.some((c) => !vs.channels.includes(c));
    const locations = capped(vs.locations, MAX_ROWS);
    return {
      ok: true as const,
      brand: ready.brand,
      range,
      channels: vs.channels,
      note: substituted
        ? `Requested ${requested.join(" vs ")} but at least one had no sales in the range, so the top two by net are compared. Say so.`
        : null,
      channelsWithSales: vs.available,
      table: vs.table.map((row) => ({
        channel: row.channel,
        ...kpis(row),
        sharePct: pct(row.share),
        discountRatePct: pct(row.discountRate),
        mtdNet: money(row.mtdNet),
      })),
      weekly: vs.weeks.map((week) => ({
        weekStart: week.week,
        net: week.net.map(money),
        avgTicket: week.atv.map(moneyOrNull),
      })),
      locations: {
        rows: locations.rows.map((row) => ({
          location: row.location,
          net: row.net.map(money),
          total: money(row.total),
        })),
        total: locations.total,
        truncated: locations.truncated,
      },
      seriesOrder: "net/avgTicket arrays are indexed like `channels`",
    };
  },
});

export const getDeliveryCampaigns = createTool({
  id: "get-delivery-campaigns",
  description:
    "Aggregator campaigns registered for the brand (the marketing tool's " +
    "aggregator offers, matched to POS items on the item code) whose window " +
    "overlaps the range: code, channel, name, start and end dates. Cheap; " +
    "use it for 'which campaigns ran', 'what was live on Wolt in May'.",
  inputSchema: deliveryCampaignsInputSchema,
  execute: async (input, context) => {
    const ready = access(input.brand, context?.requestContext);
    if (!ready.ok) return ready;

    const outcome = await ready.gateway.getCampaigns({
      brand: ready.brand,
      scopedBrands: ready.scopedBrands,
      from: input.from ?? null,
      to: input.to ?? null,
    });
    if (!outcome.ok) return fromGateway(outcome.error);

    const sorted = [...outcome.value.campaigns].sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt),
    );
    const list = capped(sorted, MAX_ROWS);
    return {
      ok: true as const,
      brand: ready.brand,
      range: outcome.value.range,
      campaigns: list.rows,
      total: list.total,
      truncated: list.truncated,
    };
  },
});

export const getDeliveryOfferValues = createTool({
  id: "get-delivery-offer-values",
  description:
    "The /sales/delivery Offers tab for ONE channel: each offer sold on that " +
    "channel with units, orders, offer net, add-on net (rest of the basket), " +
    "food cost, contribution, margin %, verdict vs the brand's food-cost " +
    "target, discount given vs list price, and the matching registered " +
    "campaigns. HEAVY query: one channel per call, an explicit range, and " +
    "never loop over every channel unless the user asks for that.",
  inputSchema: deliveryOfferValuesInputSchema,
  execute: async (input, context) => {
    const ready = access(input.brand, context?.requestContext);
    if (!ready.ok) return ready;

    const outcome = await ready.gateway.getOfferValues({
      brand: ready.brand,
      scopedBrands: ready.scopedBrands,
      from: input.from,
      to: input.to,
      channel: input.channel,
    });
    if (!outcome.ok) return fromGateway(outcome.error);

    const { range, idealFcPerc, matrix } = outcome.value;
    const offers = capped(matrix.rows, input.limit ?? 30);
    return {
      ok: true as const,
      brand: ready.brand,
      channel: input.channel,
      range,
      idealFcPct: pct(idealFcPerc),
      channelOfferNet: money(matrix.offerNet[0] ?? 0),
      offers: offers.rows.map(({ code, name, cells }) => {
        const { offer, campaigns } = cells[0]!;
        return {
          code,
          name,
          units: offer.units,
          orders: offer.orders,
          offerNet: money(offer.offerNet),
          addonNet: money(offer.addonNet),
          foodCost: moneyOrNull(offer.foodCost),
          contribution: moneyOrNull(offer.contribution),
          marginPct: pct(offer.marginPct),
          verdict: offer.verdict,
          discountGiven: moneyOrNull(offer.discountGiven),
          daysOnSale: offer.daysOnSale,
          firstSale: offer.firstSale,
          lastSale: offer.lastSale,
          campaigns: campaigns.map((c) => ({
            name: c.name,
            startsAt: c.startsAt,
            endsAt: c.endsAt,
          })),
        };
      }),
      total: offers.total,
      truncated: offers.truncated,
    };
  },
});

/** Spread into the Delivery Assistant (`tools: { ...salesDeliveryTools }`). */
export const salesDeliveryTools = {
  getDeliveryOverview,
  compareDeliveryChannels,
  getDeliveryCampaigns,
  getDeliveryOfferValues,
};
