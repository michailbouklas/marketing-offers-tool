import { RequestContext } from "@mastra/core/request-context";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildChannelVs,
  buildDeliveryDashboard,
  buildOfferMatrix,
  type DeliveryDayRow,
  type DeliveryLocationRow,
} from "../../../services/sales-delivery";
import { valueOffer } from "../../../services/sales-offers";
import { BRAND_SCOPE_RUNTIME_KEY } from "../chat-registry";
import {
  setSalesDeliveryGateway,
  type SalesDeliveryGateway,
} from "./sales-delivery-gateway";
import {
  compareDeliveryChannels,
  compareDeliveryChannelsInputSchema,
  deliveryOfferValuesInputSchema,
  deliveryOverviewInputSchema,
  getDeliveryCampaigns,
  getDeliveryOfferValues,
  getDeliveryOverview,
  MAX_ROWS,
  REFUSAL_SENTENCE,
} from "./sales-delivery-tools";

const range = { from: "2026-10-01", to: "2026-10-31" };

const days: DeliveryDayRow[] = [
  {
    day: "2026-10-01",
    channel: "Wolt",
    net: 100.456,
    gross: 120,
    discount: 19.544,
    orders: 4,
  },
  {
    day: "2026-10-02",
    channel: "Bolt",
    net: 50,
    gross: 60,
    discount: 10,
    orders: 2,
  },
  {
    day: "2026-10-09",
    channel: "Wolt",
    net: 49.544,
    gross: 55,
    discount: 5.456,
    orders: 2,
  },
];
const locations: DeliveryLocationRow[] = Array.from({ length: 15 }, (_, i) => ({
  location: `Store ${i}`,
  channel: i % 2 ? "Bolt" : "Wolt",
  net: 100 - i,
  orders: 3,
}));

const offer = valueOffer(
  {
    code: "OF1",
    name: "Wolt meal",
    channel: "Wolt",
    category: "Wolt Offers",
    fcPerc: null,
    fcEur: 2,
    sellingPrice: 10,
    firstSale: "2026-10-01",
    lastSale: "2026-10-30",
    daysOnSale: 30,
    units: 10,
    orders: 9,
    offerNet: 80.555,
    addonNet: 20,
  },
  0.3,
);
const campaign = {
  code: "OF1",
  channel: "Wolt",
  name: "Autumn deal",
  startsAt: "2026-10-01",
  endsAt: "2026-10-31",
};

function fakeGateway(overrides: Partial<SalesDeliveryGateway> = {}) {
  const gateway: SalesDeliveryGateway = {
    getOverview: vi.fn(async ({ channel }) => ({
      ok: true as const,
      value: {
        range,
        dashboard: buildDeliveryDashboard({
          days,
          locations,
          ...range,
          channel,
        }),
      },
    })),
    compareChannels: vi.fn(async ({ channels }) => ({
      ok: true as const,
      value: {
        range,
        vs: buildChannelVs({ days, locations, ...range, requested: channels }),
      },
    })),
    getCampaigns: vi.fn(async () => ({
      ok: true as const,
      value: { range, campaigns: [campaign] },
    })),
    getOfferValues: vi.fn(async ({ channel }) => ({
      ok: true as const,
      value: {
        range,
        idealFcPerc: 0.3,
        matrix: buildOfferMatrix([{ channel, offers: [offer] }], [campaign]),
      },
    })),
    ...overrides,
  };
  setSalesDeliveryGateway(gateway);
  return gateway;
}

function scoped(aliases: unknown = ["bk", "kfc"]) {
  const requestContext = new RequestContext();
  requestContext.set(BRAND_SCOPE_RUNTIME_KEY, aliases);
  return { requestContext } as never;
}

type Result = Record<string, any>;
const run = async (
  tool: { execute?: unknown },
  input: unknown,
  context: unknown,
) =>
  (await (tool.execute as (i: unknown, c: unknown) => Promise<unknown>)(
    input,
    context,
  )) as Result;

afterEach(() => setSalesDeliveryGateway(null));

describe("brand scope + gateway guards", () => {
  const tools = [
    [getDeliveryOverview, { brand: "bk" }],
    [compareDeliveryChannels, { brand: "bk" }],
    [getDeliveryCampaigns, { brand: "bk" }],
    [getDeliveryOfferValues, { brand: "bk", channel: "Wolt", ...range }],
  ] as const;

  it.each(tools)(
    "fails closed without a published scope (%#)",
    async (tool, input) => {
      const gateway = fakeGateway();
      const result = await run(tool, input, {
        requestContext: new RequestContext(),
      });
      expect(result).toMatchObject({ ok: false, code: "SCOPE_MISSING" });
      expect(
        Object.values(gateway).every((fn) => !vi.mocked(fn).mock.calls.length),
      ).toBe(true);
    },
  );

  it.each(tools)(
    "refuses an out-of-scope brand without calling the gateway (%#)",
    async (tool, input) => {
      const gateway = fakeGateway();
      const result = await run(tool, { ...input, brand: "phcy" }, scoped());
      expect(result.code).toBe("FORBIDDEN");
      expect(result.error.endsWith(REFUSAL_SENTENCE)).toBe(true);
      expect(
        Object.values(gateway).every((fn) => !vi.mocked(fn).mock.calls.length),
      ).toBe(true);
    },
  );

  it.each(tools)(
    "reports GATEWAY_UNAVAILABLE when none is installed (%#)",
    async (tool, input) => {
      const result = await run(tool, input, scoped());
      expect(result).toMatchObject({ ok: false, code: "GATEWAY_UNAVAILABLE" });
    },
  );

  it("relays gateway failures", async () => {
    fakeGateway({
      getCampaigns: async () => ({
        ok: false,
        error: { code: "QUERY_FAILED", message: "boom", retryable: true },
      }),
    });
    const result = await run(getDeliveryCampaigns, { brand: "bk" }, scoped());
    expect(result).toMatchObject({
      ok: false,
      code: "QUERY_FAILED",
      retryable: true,
    });
  });
});

describe("getDeliveryOverview", () => {
  it("returns rounded KPIs, shares and capped locations; daily only on request", async () => {
    const gateway = fakeGateway();
    const result = await run(
      getDeliveryOverview,
      { brand: " BK ", topLocations: 5 },
      scoped(),
    );
    expect(gateway.getOverview).toHaveBeenCalledWith({
      brand: "bk",
      scopedBrands: ["bk", "kfc"],
      from: null,
      to: null,
      channel: null,
    });
    expect(result.kpis.range).toEqual({
      net: 200,
      gross: 235,
      discount: 35,
      orders: 8,
      avgTicket: 25,
    });
    expect(result.channelShares[0]).toEqual({
      channel: "Wolt",
      net: 150,
      sharePct: 75,
    });
    expect(result.locations).toMatchObject({ total: 15, truncated: true });
    expect(result.locations.rows).toHaveLength(5);
    expect(result.daily).toBeNull();

    const withDaily = await run(
      getDeliveryOverview,
      { brand: "bk", channel: "Wolt", includeDaily: true },
      scoped(),
    );
    expect(withDaily.kpis.range.net).toBe(150);
    expect(withDaily.daily.rows).toHaveLength(31);
    expect(withDaily.daily.rows[0]).toEqual({
      day: "2026-10-01",
      net: 100.46,
      orders: 4,
      avgTicket: 25.11,
    });
  });

  it("treats channel null (strict-schema 'all delivery') like omitted", async () => {
    // OpenAI strict tool schemas send every key, so optional fields arrive as null.
    const input = {
      brand: "bk",
      from: null,
      to: null,
      channel: null,
      includeDaily: null,
      topLocations: null,
    };
    expect(deliveryOverviewInputSchema.safeParse(input).success).toBe(true);

    const gateway = fakeGateway();
    const result = await run(getDeliveryOverview, input, scoped());
    expect(gateway.getOverview).toHaveBeenCalledWith({
      brand: "bk",
      scopedBrands: ["bk", "kfc"],
      from: null,
      to: null,
      channel: null,
    });
    expect(result.channel).toBe("all delivery channels");
    expect(result.kpis.range.net).toBe(200);
    expect(result.locations.rows).toHaveLength(10);
    expect(result.daily).toBeNull();
  });
});

describe("compareDeliveryChannels", () => {
  it("compares the requested pair head to head", async () => {
    fakeGateway();
    const result = await run(
      compareDeliveryChannels,
      { brand: "bk", channels: ["Bolt", "Wolt"] },
      scoped(),
    );
    expect(result.channels).toEqual(["Wolt", "Bolt"]);
    expect(result.note).toBeNull();
    expect(result.table[1]).toMatchObject({
      channel: "Bolt",
      net: 50,
      sharePct: 25,
      discountRatePct: 16.7,
    });
    expect(result.weekly[0].net).toEqual([100.46, 50]);
  });

  it("flags a substituted channel", async () => {
    fakeGateway();
    const result = await run(
      compareDeliveryChannels,
      { brand: "bk", channels: ["Wolt", "Foody"] },
      scoped(),
    );
    expect(result.note).toContain("top two");
  });
});

describe("nullable optional inputs", () => {
  it("accepts null for every optional field", () => {
    expect(
      compareDeliveryChannelsInputSchema.safeParse({
        brand: "bk",
        from: null,
        to: null,
        channels: null,
      }).success,
    ).toBe(true);
    expect(
      deliveryOfferValuesInputSchema.safeParse({
        brand: "bk",
        channel: "Wolt",
        ...range,
        limit: null,
      }).success,
    ).toBe(true);
  });
});

describe("getDeliveryCampaigns", () => {
  it("lists campaigns in range", async () => {
    fakeGateway();
    const result = await run(
      getDeliveryCampaigns,
      { brand: "kfc", ...range },
      scoped(),
    );
    expect(result).toMatchObject({
      ok: true,
      total: 1,
      truncated: false,
      range,
    });
    expect(result.campaigns[0].name).toBe("Autumn deal");
  });
});

describe("getDeliveryOfferValues", () => {
  it("values one channel with matched campaigns", async () => {
    const gateway = fakeGateway();
    const result = await run(
      getDeliveryOfferValues,
      { brand: "bk", channel: "Wolt", ...range },
      scoped(),
    );
    expect(gateway.getOfferValues).toHaveBeenCalledWith({
      brand: "bk",
      scopedBrands: ["bk", "kfc"],
      channel: "Wolt",
      ...range,
    });
    expect(result).toMatchObject({
      ok: true,
      idealFcPct: 30,
      channelOfferNet: 80.56,
    });
    expect(result.offers[0]).toMatchObject({
      code: "OF1",
      offerNet: 80.56,
      foodCost: 20,
      verdict: "positive",
      campaigns: [{ name: "Autumn deal" }],
    });
  });
});

describe("input schemas", () => {
  it("validates dates, channels and caps", () => {
    const ok = (
      schema: { safeParse: (v: unknown) => { success: boolean } },
      v: unknown,
    ) => schema.safeParse(v).success;

    expect(
      ok(deliveryOverviewInputSchema, { brand: "bk", from: "2026-02-30" }),
    ).toBe(false);
    expect(
      ok(deliveryOverviewInputSchema, { brand: "bk", from: "01/02/2026" }),
    ).toBe(false);
    expect(ok(deliveryOverviewInputSchema, { brand: "bk", ...range })).toBe(
      true,
    );
    expect(
      ok(deliveryOverviewInputSchema, {
        brand: "bk",
        from: "2026-11-01",
        to: "2026-10-01",
      }),
    ).toBe(false);
    expect(
      ok(deliveryOverviewInputSchema, { brand: "bk", channel: "Uber" }),
    ).toBe(false);
    expect(
      ok(deliveryOverviewInputSchema, {
        brand: "bk",
        topLocations: MAX_ROWS + 1,
      }),
    ).toBe(false);

    expect(
      ok(compareDeliveryChannelsInputSchema, {
        brand: "bk",
        channels: ["Wolt"],
      }),
    ).toBe(false);
    expect(
      ok(compareDeliveryChannelsInputSchema, {
        brand: "bk",
        channels: ["Wolt", "Bolt", "Foody"],
      }),
    ).toBe(false);

    // Offer valuation needs one channel and an explicit range.
    expect(
      ok(deliveryOfferValuesInputSchema, { brand: "bk", channel: "Wolt" }),
    ).toBe(false);
    expect(ok(deliveryOfferValuesInputSchema, { brand: "bk", ...range })).toBe(
      false,
    );
    expect(
      ok(deliveryOfferValuesInputSchema, {
        brand: "bk",
        channel: "Wolt",
        ...range,
        limit: MAX_ROWS + 1,
      }),
    ).toBe(false);
  });
});
