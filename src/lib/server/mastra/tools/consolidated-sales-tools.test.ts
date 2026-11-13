import { RequestContext } from "@mastra/core/request-context";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildConsolidatedReport,
  type ConsolidatedRow,
} from "../../../services/sales-consolidated";
import { BRAND_SCOPE_RUNTIME_KEY } from "../chat-registry";
import {
  setConsolidatedSalesGateway,
  type ConsolidatedSalesGateway,
} from "./consolidated-sales-gateway";
import {
  compactReport,
  getConsolidatedOptions,
  getConsolidatedReport,
  MAX_ROWS,
  REFUSAL_SENTENCE,
  reportInputSchema,
} from "./consolidated-sales-tools";

const filters = { brands: ["phc"], from: "2026-10-01", to: "2026-10-31" };

const row = (overrides: Partial<ConsolidatedRow>): ConsolidatedRow => ({
  company: "C1",
  companyLabel: "Company One",
  store: "S1",
  location: "Store One",
  city: "Nicosia",
  trans: 10,
  gross: 120.555,
  discount: 20.111,
  net: 100.444,
  ...overrides,
});

const rows: ConsolidatedRow[] = [
  row({}),
  row({
    store: "S2",
    location: "Store Two",
    city: "Limassol",
    trans: 0,
    gross: 0,
    discount: 0,
    net: 0,
  }),
  row({
    company: "C2",
    companyLabel: "Company Two",
    store: "S3",
    location: "Store Three",
    trans: 5,
    gross: 60,
    discount: 10,
    net: 50,
  }),
];

function fakeGateway(): ConsolidatedSalesGateway {
  const gateway: ConsolidatedSalesGateway = {
    getOptions: vi.fn(async () => ({
      ok: true as const,
      value: {
        filters,
        options: {
          channels: ["Foody", "Wolt"],
          stores: [{ store: "S1", location: "Store One", city: "Nicosia" }],
          cities: ["Nicosia"],
        },
      },
    })),
    getReport: vi.fn(async () => ({
      ok: true as const,
      value: { filters, report: buildConsolidatedReport(rows) },
    })),
  };
  setConsolidatedSalesGateway(gateway);
  return gateway;
}

function scoped(aliases: unknown = ["PHC", "kfc"]) {
  const requestContext = new RequestContext();
  requestContext.set(BRAND_SCOPE_RUNTIME_KEY, aliases);
  return { requestContext } as never;
}

type Result = Record<string, unknown> & {
  ok: boolean;
  code?: string;
  error?: string;
};
const run = async (promise: Promise<unknown>) => (await promise) as Result;

afterEach(() => setConsolidatedSalesGateway(null));

describe("brand scope", () => {
  it("refuses when no scope was published", async () => {
    const gateway = fakeGateway();
    const result = await run(
      getConsolidatedReport.execute!({ brands: ["phc"] } as never, {} as never),
    );
    expect(result).toMatchObject({ ok: false, code: "SCOPE_MISSING" });
    expect(gateway.getReport).not.toHaveBeenCalled();
  });

  it("refuses an out-of-scope brand without calling the gateway", async () => {
    const gateway = fakeGateway();
    const result = await run(
      getConsolidatedReport.execute!(
        { brands: ["phc", "burgerking"] } as never,
        scoped(),
      ),
    );
    expect(result.code).toBe("FORBIDDEN");
    expect(result.error?.endsWith(REFUSAL_SENTENCE)).toBe(true);
    expect(gateway.getReport).not.toHaveBeenCalled();

    const options = await run(
      getConsolidatedOptions.execute!({ brands: ["other"] } as never, scoped()),
    );
    expect(options.code).toBe("FORBIDDEN");
    expect(gateway.getOptions).not.toHaveBeenCalled();
  });

  it("fails when the gateway is missing", async () => {
    const result = await run(
      getConsolidatedReport.execute!({ brands: [] } as never, scoped()),
    );
    expect(result).toMatchObject({ ok: false, code: "GATEWAY_UNAVAILABLE" });
  });
});

describe("getConsolidatedOptions", () => {
  it("returns options and passes the lowercased scope", async () => {
    const gateway = fakeGateway();
    const result = await run(
      getConsolidatedOptions.execute!(
        { brands: [], from: "2026-10-01", to: "2026-10-31" } as never,
        scoped(),
      ),
    );
    expect(result).toMatchObject({
      ok: true,
      channels: ["Foody", "Wolt"],
      cities: ["Nicosia"],
      storesTruncated: false,
      note: null,
    });
    expect(gateway.getOptions).toHaveBeenCalledWith(
      expect.objectContaining({ scopeBrands: ["phc", "kfc"], brands: [] }),
    );
  });
});

describe("getConsolidatedReport", () => {
  it("returns the page report with rounded money and normalised filters", async () => {
    const gateway = fakeGateway();
    const result = await run(
      getConsolidatedReport.execute!(
        {
          brands: [" PHC "],
          from: "2026-10-01",
          to: "2026-10-31",
          weekdays: [7, 6, 6],
        } as never,
        scoped(),
      ),
    );
    expect(gateway.getReport).toHaveBeenCalledWith(
      expect.objectContaining({ brands: ["phc"], weekdays: [6, 7] }),
    );
    expect(result).toMatchObject({
      ok: true,
      groupBy: "company",
      storeCount: 3,
      truncated: false,
      grandTotal: { trans: 15, gross: 180.56, net: 150.44 },
    });
    const companies = result.companies as {
      company: string;
      subtotal: { avgNet: number | null };
    }[];
    expect(companies.map((company) => company.company)).toEqual([
      "Company One",
      "Company Two",
    ]);
    expect(companies[0].subtotal.avgNet).toBe(10.04);
  });

  it("groups by city and store", () => {
    const report = buildConsolidatedReport(rows);
    const byCity = compactReport(report, "city") as {
      cities: { city: string; stores: number; trans: number }[];
    };
    expect(byCity.cities[0]).toMatchObject({
      city: "Nicosia",
      stores: 2,
      trans: 15,
    });
    const byStore = compactReport(report, "store") as {
      stores: { store: string; avgNet: number | null }[];
    };
    expect(byStore.stores.map((line) => line.store)).toEqual([
      "S1",
      "S3",
      "S2",
    ]);
    expect(byStore.stores[2].avgNet).toBeNull();
  });

  it("caps store lines and says so", () => {
    const many = Array.from({ length: MAX_ROWS + 5 }, (_, index) =>
      row({ store: `S${index}`, location: `L${index}` }),
    );
    const compact = compactReport(buildConsolidatedReport(many), "company") as {
      truncated: boolean;
      companies: { stores: unknown[] }[];
    };
    expect(compact.truncated).toBe(true);
    expect(compact.companies[0].stores).toHaveLength(MAX_ROWS);
  });
});

describe("input schema", () => {
  it("rejects bad dates and ranges over the page cap", () => {
    expect(reportInputSchema.safeParse({ from: "2026-02-30" }).success).toBe(
      false,
    );
    expect(
      reportInputSchema.safeParse({ from: "2025-01-01", to: "2026-01-02" })
        .success,
    ).toBe(false);
    expect(
      reportInputSchema.safeParse({ from: "2025-01-01", to: "2026-01-01" })
        .success,
    ).toBe(true);
    expect(
      reportInputSchema.safeParse({ from: "2026-02-01", to: "2026-01-01" })
        .success,
    ).toBe(false);
  });

  it("caps weekdays and list sizes", () => {
    expect(reportInputSchema.safeParse({ weekdays: [8] }).success).toBe(false);
    expect(
      reportInputSchema.safeParse({
        stores: Array.from({ length: 51 }, (_, i) => `S${i}`),
      }).success,
    ).toBe(false);
    expect(reportInputSchema.parse({})).toMatchObject({
      brands: [],
      groupBy: "company",
      weekdays: [],
    });
  });
});
