import { RequestContext } from "@mastra/core/request-context";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildItemAnalysis } from "../../../services/sales-item-analysis";
import { BRAND_SCOPE_RUNTIME_KEY } from "../chat-registry";
import type { GatewayOutcome } from "./forecast-gateway";
import {
  getItemAnalysis,
  getItemAnalysisInputSchema,
} from "./item-analysis-tools";
import {
  setSalesOffersGateway,
  type SalesOffersGateway,
} from "./sales-offers-gateway";
import { REFUSAL_SENTENCE } from "./sales-offers-tools";

const ok = <T>(value: T): GatewayOutcome<T> => ({ ok: true, value });

const report = buildItemAnalysis([
  {
    level: "grand",
    category: "",
    code: "",
    name: "",
    qty: 300,
    trans: 90,
    net: 1000,
  },
  {
    level: "category",
    category: "Pizzas",
    code: "",
    name: "",
    qty: 200,
    trans: 80,
    net: 900,
  },
  {
    level: "item",
    category: "Pizzas",
    code: "PIZ1",
    name: "Margherita",
    qty: 120,
    trans: 60,
    net: 500.555,
  },
  {
    level: "item",
    category: "Pizzas",
    code: "PIZ2",
    name: "Pepperoni",
    qty: 80,
    trans: 50,
    net: 399.445,
  },
  {
    level: "category",
    category: "Drinks",
    code: "",
    name: "",
    qty: 100,
    trans: 30,
    net: 100,
  },
  {
    level: "item",
    category: "Drinks",
    code: "COLA",
    name: "Cola",
    qty: 100,
    trans: 30,
    net: 100,
  },
]);

function installGateway() {
  const gateway = {
    listFilterOptions: vi.fn(async () =>
      ok({
        channels: ["Wolt"],
        locations: [{ id: 7, name: "Strovolos", city: "Nicosia" }],
      }),
    ),
    getItemAnalysis: vi.fn(async () => ok(report)),
  } as Partial<SalesOffersGateway> as SalesOffersGateway;
  setSalesOffersGateway(gateway);
  return gateway;
}

function ctx(aliases?: string[]) {
  const requestContext = new RequestContext();
  if (aliases) requestContext.set(BRAND_SCOPE_RUNTIME_KEY, aliases);
  return { requestContext } as never;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = { ok: boolean; code?: string; error?: string } & Record<
  string,
  any
>;
const run = (input: Record<string, unknown>, aliases = ["phcy"]) =>
  getItemAnalysis.execute!(
    getItemAnalysisInputSchema.parse({
      brand: "phcy",
      from: "2026-11-09",
      to: "2026-11-12",
      ...input,
    }),
    ctx(aliases),
  ) as Promise<Result>;

afterEach(() => {
  setSalesOffersGateway(null);
  vi.clearAllMocks();
});

describe("getItemAnalysis", () => {
  it("refuses an out-of-scope brand without touching the warehouse", async () => {
    const gateway = installGateway();
    const result = await run({ brand: "kfc" });
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(result.error).toContain(REFUSAL_SENTENCE);
    expect(gateway.getItemAnalysis).not.toHaveBeenCalled();
  });

  it("fails closed without a gateway", async () => {
    expect(await run({})).toMatchObject({
      ok: false,
      code: "GATEWAY_UNAVAILABLE",
    });
  });

  it("returns every category total and the top items by net, rounded", async () => {
    installGateway();
    const result = await run({});
    expect(result.ok).toBe(true);
    expect(result.grandTotal).toEqual({ qty: 300, trans: 90, net: 1000 });
    expect(
      result.categories.map((c: { category: string }) => c.category),
    ).toEqual(["Pizzas", "Drinks"]);
    expect(result.items[0]).toMatchObject({
      code: "PIZ1",
      category: "Pizzas",
      net: 500.56,
      qtyGrpPct: 60,
      qtyTotPct: 40,
      qtyPerTransPct: 133.333,
      transGrpPct: 75,
      netTotPct: 50.1,
    });
    expect(result.filters).toMatchObject({ channels: "all", locations: "all" });
  });

  it("filters by category, search, sort and limit", async () => {
    installGateway();
    const drinks = await run({ categories: ["drinks"] });
    expect(drinks.items.map((i: { code: string }) => i.code)).toEqual(["COLA"]);
    expect(drinks.categories).toHaveLength(2); // totals stay complete

    const byQty = await run({ sortBy: "qty", limit: 1 });
    expect(byQty.items.map((i: { code: string }) => i.code)).toEqual(["PIZ1"]);
    expect(byQty).toMatchObject({ matchingItems: 3, truncated: true });

    const search = await run({ search: "pepp" });
    expect(search.items.map((i: { code: string }) => i.code)).toEqual(["PIZ2"]);
  });

  it("canonicalises channels and rejects unknown ones", async () => {
    const gateway = installGateway();
    await run({ channels: ["wolt"], locations: [7] });
    expect(gateway.getItemAnalysis).toHaveBeenCalledWith("phcy", {
      range: { from: "2026-11-09", to: "2026-11-12" },
      channels: ["Wolt"],
      locations: [7],
    });
    expect(await run({ channels: ["Bolt"] })).toMatchObject({
      ok: false,
      code: "UNKNOWN_CHANNEL",
    });
  });
});
