import { RequestContext } from "@mastra/core/request-context";
import { afterEach, describe, expect, it, vi } from "vitest";
import { valueOffer, type OfferValueRow } from "../../../services/sales-offers";
import { BRAND_SCOPE_RUNTIME_KEY } from "../chat-registry";
import type { GatewayOutcome } from "./forecast-gateway";
import {
  setSalesOffersGateway,
  type OfferValuesResult,
  type SalesOffersGateway,
} from "./sales-offers-gateway";
import {
  authorizeBrand,
  compareOffers,
  compareOffersInputSchema,
  getOfferCalendar,
  getOfferSlotSales,
  getOfferSlotSalesInputSchema,
  getOfferValues,
  getOfferValuesInputSchema,
  listOfferFilterOptions,
  MAX_ROWS,
  REFUSAL_SENTENCE,
} from "./sales-offers-tools";

const ok = <T>(value: T): GatewayOutcome<T> => ({ ok: true, value });

const row = (overrides: Partial<OfferValueRow>): OfferValueRow => ({
  code: "OF1",
  name: "Family Deal",
  channel: null,
  category: null,
  fcPerc: 0.3,
  fcEur: null,
  sellingPrice: 10.5,
  firstSale: "2026-01-01",
  lastSale: "2026-10-31",
  daysOnSale: 100,
  units: 200,
  orders: 180,
  offerNet: 1800,
  addonNet: 900,
  listDiscount: null,
  ...overrides,
});

// OF1 = skill worked example (below_target, contribution 1,848); OF2 = loss; OF3 = no_cost.
const offers = [
  valueOffer(row({}), 0.28),
  valueOffer(
    row({
      code: "OF2",
      name: "Lunch Box",
      fcPerc: null,
      fcEur: 3.5,
      units: 200,
      offerNet: 500,
      addonNet: 100,
    }),
    0.28,
  ),
  valueOffer(row({ code: "OF3", name: "No Cost", fcPerc: null }), 0.28),
];

const values = (source: "cache" | "live"): OfferValuesResult => ({
  source,
  offers,
  computedAt: "2026-11-13T05:00:00.000Z",
  idealFcPerc: 0.28,
});

function fakeGateway(overrides: Partial<SalesOffersGateway> = {}) {
  const gateway: SalesOffersGateway = {
    listFilterOptions: vi.fn(async () =>
      ok({
        channels: ["Dine In", "Wolt"],
        locations: [{ id: 4, name: "Limassol Marina" }],
      }),
    ),
    getCachedOfferValues: vi.fn(async () => ok(values("cache"))),
    getLiveOfferValues: vi.fn(async () => ok(values("live"))),
    compareOffers: vi.fn(async (_brand, codes) =>
      ok({
        source: "cache" as const,
        computedAt: "2026-11-13T05:00:00.000Z",
        idealFcPerc: 0.28,
        offers: offers.slice(0, 1).map((value) => ({
          value,
          reason: "because",
          weekdayMix: [0.5, 0.5, 0, 0, 0, 0, 0],
          weeks: [
            {
              weekStart: "2026-01-01",
              units: 10,
              orders: 9,
              net: 90.123,
              price: 9.0123,
            },
          ],
        })),
        missing: codes.filter((code: string) => code !== "OF1"),
        metrics: null,
      }),
    ),
    getOfferCalendarRows: vi.fn(async () =>
      ok([
        { day: "2026-10-02", weekday: 5, hour: 19, units: 10, net: 100 },
        { day: "2026-10-03", weekday: 6, hour: 13, units: 4, net: 40 },
        { day: "2026-10-09", weekday: 5, hour: 19, units: 6, net: 60 },
      ]),
    ),
    getOfferSlotSales: vi.fn(async () =>
      ok([{ code: "OF1", name: "Family Deal", units: 3, orders: 3, net: 30 }]),
    ),
    ...overrides,
  };
  setSalesOffersGateway(gateway);
  return gateway;
}

function ctx(aliases?: string[]) {
  const requestContext = new RequestContext();
  if (aliases) requestContext.set(BRAND_SCOPE_RUNTIME_KEY, aliases);
  return { requestContext } as never;
}

type Result = { ok: boolean; code?: string; error?: string } & Record<
  string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;
const run = async (promise: Promise<unknown> | undefined) =>
  (await promise) as Result;

const valuesInput = (input: Record<string, unknown> = {}) =>
  getOfferValuesInputSchema.parse({ brand: "phcy", ...input });

afterEach(() => {
  setSalesOffersGateway(null);
  vi.clearAllMocks();
});

describe("authorizeBrand", () => {
  it("fails closed without a published scope", () => {
    expect(authorizeBrand("phcy", undefined)).toMatchObject({
      ok: false,
      code: "SCOPE_MISSING",
    });
  });

  it("refuses an out-of-scope brand with the exact sentence", () => {
    const result = authorizeBrand("kfc", {
      get: () => ["phcy"],
    });
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
    if (!result.ok) expect(result.error.endsWith(REFUSAL_SENTENCE)).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(authorizeBrand(" PHCY ", { get: () => ["phcy"] })).toEqual({
      ok: true,
      brand: "phcy",
    });
  });
});

describe("guards on every tool", () => {
  const calls = [
    () => listOfferFilterOptions.execute!({ brand: "kfc" }, ctx(["phcy"])),
    () => getOfferValues.execute!(valuesInput({ brand: "kfc" }), ctx(["phcy"])),
    () =>
      compareOffers.execute!(
        compareOffersInputSchema.parse({ brand: "kfc", codes: ["OF1"] }),
        ctx(["phcy"]),
      ),
    () =>
      getOfferCalendar.execute!(
        { brand: "kfc", from: "2026-10-01", to: "2026-10-31" },
        ctx(["phcy"]),
      ),
    () =>
      getOfferSlotSales.execute!(
        getOfferSlotSalesInputSchema.parse({
          brand: "kfc",
          from: "2026-10-01",
          to: "2026-10-31",
          weekday: 5,
        }),
        ctx(["phcy"]),
      ),
  ];

  it.each(calls.map((call, i) => [i, call]))(
    "tool %i: out-of-scope brand is FORBIDDEN and the gateway is never called",
    async (_i, call) => {
      const gateway = fakeGateway();
      const result = await run(call());
      expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(result.error).toContain(REFUSAL_SENTENCE);
      for (const method of Object.values(gateway)) {
        expect(method).not.toHaveBeenCalled();
      }
    },
  );

  it("no scope at all is refused", async () => {
    fakeGateway();
    const result = await run(
      getOfferValues.execute!(valuesInput(), ctx(undefined)),
    );
    expect(result).toMatchObject({ ok: false, code: "SCOPE_MISSING" });
  });

  it("missing gateway -> GATEWAY_UNAVAILABLE", async () => {
    const result = await run(
      getOfferValues.execute!(valuesInput(), ctx(["phcy"])),
    );
    expect(result).toMatchObject({ ok: false, code: "GATEWAY_UNAVAILABLE" });
  });
});

describe("getOfferValues", () => {
  it("all time with no filters reads the cache, with a verdict summary", async () => {
    const gateway = fakeGateway();
    const result = await run(
      getOfferValues.execute!(valuesInput(), ctx(["phcy"])),
    );
    expect(gateway.getCachedOfferValues).toHaveBeenCalledWith("phcy");
    expect(gateway.getLiveOfferValues).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.source).toBe("cache");
    expect(result.summary.byVerdict).toMatchObject({
      below_target: 1,
      loss: 1,
      no_cost: 1,
    });
    // OF2: 500 − 3.5 × 200 + 100 × 0.72 = −128; OF3 (no cost) adds nothing.
    expect(result.summary.contribution).toBe(1848 - 128);
    // Default sort = contribution desc; unknown contribution sinks to the bottom.
    expect(result.rows.map((r: { code: string }) => r.code)).toEqual([
      "OF1",
      "OF2",
      "OF3",
    ]);
    expect(result.rows[0]).toMatchObject({
      foodCost: 600,
      contribution: 1848,
      marginPercent: 68.4,
      qtyPerTxn: 1.11,
      addonPerOrder: 5,
      verdict: "below_target",
    });
  });

  it("a range goes live and verdict/search filter the rows", async () => {
    const gateway = fakeGateway();
    const result = await run(
      getOfferValues.execute!(
        valuesInput({
          from: "2026-10-31",
          to: "2026-10-01",
          verdict: "loss",
        }),
        ctx(["phcy"]),
      ),
    );
    expect(gateway.getLiveOfferValues).toHaveBeenCalledWith("phcy", {
      range: { from: "2026-10-01", to: "2026-10-31" },
      channels: [],
      locations: [],
    });
    expect(result.rows.map((r: { code: string }) => r.code)).toEqual(["OF2"]);
    expect(result.matching).toBe(1);
  });

  it("channel/location filters without a range never run a live all-time scan", async () => {
    const gateway = fakeGateway();
    const result = await run(
      getOfferValues.execute!(
        valuesInput({ channels: ["wolt"] }),
        ctx(["phcy"]),
      ),
    );
    expect(result).toMatchObject({ ok: false, code: "RANGE_REQUIRED" });
    expect(gateway.getLiveOfferValues).not.toHaveBeenCalled();
    expect(gateway.getCachedOfferValues).not.toHaveBeenCalled();
  });

  it("canonicalises channels and rejects foreign locations", async () => {
    const gateway = fakeGateway();
    const range = { from: "2026-10-01", to: "2026-10-31" };
    await run(
      getOfferValues.execute!(
        valuesInput({ ...range, channels: ["wolt"], locations: [4] }),
        ctx(["phcy"]),
      ),
    );
    expect(gateway.getLiveOfferValues).toHaveBeenCalledWith("phcy", {
      range,
      channels: ["Wolt"],
      locations: [4],
    });
    const foreign = await run(
      getOfferValues.execute!(
        valuesInput({ ...range, locations: [99] }),
        ctx(["phcy"]),
      ),
    );
    expect(foreign).toMatchObject({ ok: false, code: "UNKNOWN_LOCATION" });
  });

  it("rejects ranges over 366 days and half ranges", async () => {
    fakeGateway();
    const long = await run(
      getOfferValues.execute!(
        valuesInput({ from: "2024-01-01", to: "2026-01-01" }),
        ctx(["phcy"]),
      ),
    );
    expect(long).toMatchObject({ ok: false, code: "RANGE_TOO_LONG" });
    const half = await run(
      getOfferValues.execute!(
        valuesInput({ from: "2026-01-01" }),
        ctx(["phcy"]),
      ),
    );
    expect(half).toMatchObject({ ok: false, code: "INVALID_RANGE" });
  });

  it("an empty cache is reported, not rebuilt", async () => {
    fakeGateway({ getCachedOfferValues: vi.fn(async () => ok(null)) });
    const result = await run(
      getOfferValues.execute!(valuesInput(), ctx(["phcy"])),
    );
    expect(result).toMatchObject({ ok: false, code: "CACHE_EMPTY" });
  });
});

describe("input schema caps", () => {
  it("caps rows, codes, channels and dates", () => {
    expect(() => valuesInput({ limit: MAX_ROWS + 1 })).toThrow();
    expect(() =>
      valuesInput({ from: "2026-02-30", to: "2026-03-01" }),
    ).toThrow();
    expect(() =>
      valuesInput({ channels: Array.from({ length: 21 }, (_, i) => `c${i}`) }),
    ).toThrow();
    expect(() =>
      compareOffersInputSchema.parse({ brand: "phcy", codes: ["a", "b", "c"] }),
    ).toThrow();
    expect(() =>
      compareOffersInputSchema.parse({ brand: "phcy", codes: [] }),
    ).toThrow();
    expect(() =>
      getOfferSlotSalesInputSchema.parse({
        brand: "phcy",
        from: "2026-10-01",
        to: "2026-10-31",
        weekday: 8,
      }),
    ).toThrow();
  });
});

describe("other tools", () => {
  it("listOfferFilterOptions returns channels and locations", async () => {
    fakeGateway();
    const result = await run(
      listOfferFilterOptions.execute!({ brand: "phcy" }, ctx(["phcy"])),
    );
    expect(result).toMatchObject({
      ok: true,
      range: "all time",
      channels: ["Dine In", "Wolt"],
      locations: [{ id: 4, name: "Limassol Marina" }],
    });
  });

  it("compareOffers rounds and reports missing codes", async () => {
    fakeGateway();
    const result = await run(
      compareOffers.execute!(
        compareOffersInputSchema.parse({ brand: "phcy", codes: ["OF1", "ZZ"] }),
        ctx(["phcy"]),
      ),
    );
    expect(result.missing).toEqual(["ZZ"]);
    expect(result.offers[0]).toMatchObject({
      code: "OF1",
      reason: "because",
      weekdayMixPercent: { Mon: 50, Tue: 50, Sun: 0 },
    });
    expect(result.offers[0].weeks[0]).toMatchObject({
      net: 90.12,
      avgPrice: 9.01,
    });
  });

  it("getOfferCalendar folds rows by weekday, hour and slot", async () => {
    fakeGateway();
    const result = await run(
      getOfferCalendar.execute!(
        { brand: "phcy", from: "2026-10-01", to: "2026-10-31" },
        ctx(["phcy"]),
      ),
    );
    expect(result.totals).toEqual({ units: 20, net: 200 });
    expect(result.byWeekday[4]).toEqual({ slot: "Fri", units: 16, net: 160 });
    expect(result.topWeekdayHours[0]).toEqual({
      slot: "Fri 19:00",
      units: 16,
      net: 160,
    });
    expect(result.topDays[0].slot).toBe("2026-10-02");
  });

  it("getOfferSlotSales passes the slot and rejects ambiguous slots", async () => {
    const gateway = fakeGateway();
    const base = { brand: "phcy", from: "2026-10-01", to: "2026-10-31" };
    const result = await run(
      getOfferSlotSales.execute!(
        getOfferSlotSalesInputSchema.parse({ ...base, weekday: 5, hour: 19 }),
        ctx(["phcy"]),
      ),
    );
    expect(gateway.getOfferSlotSales).toHaveBeenCalledWith(
      "phcy",
      {
        range: { from: "2026-10-01", to: "2026-10-31" },
        channels: [],
        locations: [],
      },
      { weekday: 5, hour: 19 },
    );
    expect(result.rows).toHaveLength(1);
    const ambiguous = await run(
      getOfferSlotSales.execute!(
        getOfferSlotSalesInputSchema.parse({
          ...base,
          date: "2026-10-02",
          weekday: 5,
        }),
        ctx(["phcy"]),
      ),
    );
    expect(ambiguous).toMatchObject({ ok: false, code: "INVALID_SLOT" });
  });
});
