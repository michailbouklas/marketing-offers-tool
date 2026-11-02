import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/clickhouse", () => ({ clickhouse: { query: vi.fn() } }));
vi.mock("$lib/server/auth-guards", () => ({}));
vi.mock("./sales-dashboard.server", () => ({}));

const { clickhouse } = await import("$lib/server/clickhouse");
const { buildExploreWhere, buildExploreOrderBy, queryExploreBreakdown } =
  await import("./sales-explore.server");
const {
  exploreBreakdownRequestSchema,
  exploreRowsRequestSchema,
  exploreFilterSchema,
  exploreOrderOffersRequestSchema,
  offerFilterSchema,
  describeExploreFilter,
  readExploreUrlFilters,
  serializeGridFilter,
  writeExploreUrlFilters,
} = await import("./sales-explore");

const scope = { from: "2026-10-01", to: "2026-10-31", brands: ["kfc"] };

function filterOf(raw: unknown) {
  return exploreFilterSchema.parse(serializeGridFilter(raw));
}

describe("buildExploreWhere", () => {
  it("always pins the date window and scoped brands", () => {
    const where = buildExploreWhere(scope, {});
    expect(where.sql).toContain("tran_date BETWEEN {from:Date} AND {to:Date}");
    expect(where.sql).toContain("lower(brand) IN {brands:Array(String)}");
    expect(where.params).toEqual({ ...scope });
  });

  it("a brand filter only narrows: the scope clause stays", () => {
    const where = buildExploreWhere(
      scope,
      filterOf({
        brand: {
          combination: "and",
          groups: [
            {
              combination: "and",
              conditions: [
                {
                  type: "text",
                  operator: "equals",
                  selectedValues: new Set(["bk"]),
                },
              ],
            },
          ],
        },
      }),
    );
    expect(where.sql).toContain("lower(brand) IN {brands:Array(String)}");
    expect(where.sql).toContain("(lower(brand) IN {p0:Array(String)})");
    expect(where.params.p0).toEqual(["bk"]);
  });

  it("honours both and/or levels and binds every value", () => {
    const where = buildExploreWhere(
      scope,
      filterOf({
        net: {
          combination: "or",
          groups: [
            {
              combination: "and",
              conditions: [
                { type: "number", operator: ">", value: 10 },
                { type: "number", operator: "<", value: 20 },
              ],
            },
            {
              combination: "and",
              conditions: [
                {
                  type: "number",
                  operator: "between",
                  value: 100,
                  valueTo: 200,
                },
              ],
            },
          ],
        },
        store: {
          combination: "and",
          groups: [
            {
              combination: "or",
              conditions: [
                { type: "text", operator: "contains", value: "x'); DROP" },
                { type: "text", operator: "blank" },
              ],
            },
          ],
        },
      }),
    );
    expect(where.sql).toContain(
      "((toFloat64(tran_net) > {p0:Float64} AND toFloat64(tran_net) < {p1:Float64}) OR (toFloat64(tran_net) BETWEEN {p2:Float64} AND {p3:Float64}))",
    );
    expect(where.sql).toContain(
      "((positionCaseInsensitiveUTF8(location_name, {p4:String}) > 0 OR location_name = ''))",
    );
    expect(where.sql).not.toContain("DROP");
    expect(where.params).toMatchObject({
      p0: 10,
      p1: 20,
      p2: 100,
      p3: 200,
      p4: "x'); DROP",
    });
  });

  it("serializes local dates without shifting the day", () => {
    const where = buildExploreWhere(
      scope,
      filterOf({
        day: {
          combination: "and",
          groups: [
            {
              combination: "and",
              conditions: [
                { type: "date", operator: "=", value: new Date(2026, 9, 5) },
              ],
            },
          ],
        },
      }),
    );
    expect(where.sql).toContain("tran_date = {p0:Date}");
    expect(where.params.p0).toBe("2026-10-05");
  });

  it("skips the column whose own values are being listed", () => {
    const filter = filterOf({
      store: {
        combination: "and",
        groups: [
          {
            combination: "and",
            conditions: [
              {
                type: "text",
                operator: "equals",
                selectedValues: new Set(["A"]),
              },
            ],
          },
        ],
      },
    });
    expect(buildExploreWhere(scope, filter, "store").sql).not.toContain(
      "location_name",
    );
  });

  it("ignores a condition whose type does not match the column", () => {
    const where = buildExploreWhere(
      scope,
      filterOf({
        store: {
          combination: "and",
          groups: [
            {
              combination: "and",
              conditions: [{ type: "number", operator: ">", value: 1 }],
            },
          ],
        },
      }),
    );
    expect(where.sql).not.toContain("location_name");
  });
});

describe("request schemas", () => {
  it("rejects an unknown filter column", () => {
    expect(() =>
      exploreFilterSchema.parse({
        "brand) OR 1=1 --": { combination: "and", groups: [] },
      }),
    ).toThrow();
  });

  it("rejects an unknown sort column and oversized pages", () => {
    const base = { range: { startRow: 0, endRow: 100 }, filter: {} };
    expect(
      exploreRowsRequestSchema.safeParse({
        ...base,
        sort: [{ colId: "pk; DROP", direction: "asc" }],
      }).success,
    ).toBe(false);
    expect(
      exploreRowsRequestSchema.safeParse({
        ...base,
        range: { startRow: 0, endRow: 5_000 },
      }).success,
    ).toBe(false);
    expect(
      exploreRowsRequestSchema.safeParse({ ...base, sort: [] }).success,
    ).toBe(true);
  });
});

describe("queryExploreBreakdown", () => {
  it("uses the grid WHERE, binds both category lists and maps buckets", async () => {
    const query = vi.mocked(clickhouse.query);
    query.mockResolvedValueOnce({
      json: async () => [
        {
          orders: "3",
          orderNet: 30,
          lineNet: 30,
          discount: 4,
          discountOrders: "1",
          bucketNet: [10, 5, 15],
          bucketDiscount: [3, 0, 1],
          bucketOrders: ["1", "1", "2"],
        },
      ],
    } as never);
    const result = await queryExploreBreakdown(
      { ...scope, all: false } as never,
      {
        filter: { store: { combination: "and", groups: [] } },
        offers: { mode: "any", items: [] },
      },
    );
    const call = query.mock.calls.at(-1)![0] as {
      query: string;
      query_params: Record<string, unknown>;
    };
    expect(call.query).toContain("tran_date BETWEEN {from:Date} AND {to:Date}");
    // Offer filter semi-join from buildExploreWhere is in the outer WHERE.
    expect(call.query).toContain("tran_no) IN (");
    expect(call.query).toContain("item_category != 'INTERNAL USE'");
    expect(call.query_params.brands).toEqual(["kfc"]);
    expect(call.query_params.offerCats).toContain("Coupons BK");
    expect(call.query_params.comboCats).toContain("Combo Meals");
    expect(result.orders).toBe(3);
    expect(result.buckets.offer).toEqual({ net: 10, orders: 1, discount: 3 });
    expect(result.buckets.other).toEqual({ net: 15, orders: 2, discount: 1 });
  });

  it("schema rejects an offer filter without items", () => {
    expect(
      exploreBreakdownRequestSchema.safeParse({
        filter: {},
        offers: { mode: "with", items: [] },
      }).success,
    ).toBe(false);
    expect(exploreBreakdownRequestSchema.safeParse({}).success).toBe(true);
  });
});

describe("buildExploreOrderBy", () => {
  it("maps ids to SQL and ends with pk; defaults to newest first", () => {
    expect(buildExploreOrderBy([{ colId: "net", direction: "desc" }])).toBe(
      "tran_net DESC, pk",
    );
    expect(buildExploreOrderBy([{ colId: "net", direction: null }])).toBe(
      "tran_date DESC, trans_order_time DESC, pk",
    );
  });
});

describe("offer filter", () => {
  const key = "(tran_date, tran_location, tran_division, tran_no)";

  it("with/without bind the items and use IN / NOT IN", () => {
    const withSql = buildExploreWhere(scope, {}, undefined, {
      mode: "with",
      items: ["BK1", "BK2"],
    });
    expect(withSql.sql).toContain(`${key} IN (`);
    expect(withSql.sql).toContain("AND trde_item IN {p0:Array(String)}");
    expect(withSql.params.p0).toEqual(["BK1", "BK2"]);
    expect(withSql.params.offerCats).toContain("Coupons BK");
    expect(withSql.params.offerCats).toContain("Up Selling Offers");

    const withoutSql = buildExploreWhere(scope, {}, undefined, {
      mode: "without",
      items: ["BK1"],
    });
    expect(withoutSql.sql).toContain(`${key} NOT IN (`);
  });

  it("any/none ignore items and stay brand + date scoped", () => {
    const any = buildExploreWhere(scope, {}, undefined, {
      mode: "any",
      items: ["ignored"],
    });
    expect(any.sql).toContain(`${key} IN (`);
    expect(any.sql).not.toContain("trde_item IN {");
    expect(any.sql).toContain("trde_date BETWEEN {from:Date} AND {to:Date}");
    expect(
      any.sql.match(/lower\(brand\) IN \{brands:Array\(String\)\}/g),
    ).toHaveLength(2);

    const none = buildExploreWhere(scope, {}, undefined, {
      mode: "none",
      items: [],
    });
    expect(none.sql).toContain(`${key} NOT IN (`);
  });

  it("combo only/exclude semi-join on combo header lines", () => {
    const only = buildExploreWhere(scope, {}, undefined, {
      items: [],
      combo: "only",
    });
    expect(only.sql).toContain(`${key} IN (`);
    expect(only.sql).toContain("item_category IN {comboCats:Array(String)}");
    expect(only.sql).toContain("trde_sub_line = 0");
    expect(only.sql).not.toContain("offerCats");
    expect(only.params.comboCats).toContain("Combo Meals");

    const exclude = buildExploreWhere(scope, {}, undefined, {
      items: [],
      combo: "exclude",
    });
    expect(exclude.sql).toContain(`${key} NOT IN (`);
  });

  it("offer and combo filters combine as two clauses", () => {
    const both = buildExploreWhere(scope, {}, undefined, {
      mode: "with",
      items: ["BK1"],
      combo: "exclude",
    });
    expect(both.sql).toContain(`${key} IN (`);
    expect(both.sql).toContain(`${key} NOT IN (`);
    expect(both.sql).toContain("{offerCats:Array(String)}");
    expect(both.sql).toContain("{comboCats:Array(String)}");
  });

  it("no filter adds no offer clause", () => {
    expect(buildExploreWhere(scope, {}, undefined, null).sql).not.toContain(
      "transaction_details",
    );
  });

  it("schema needs items for with/without and caps them", () => {
    expect(
      offerFilterSchema.safeParse({ mode: "with", items: [] }).success,
    ).toBe(false);
    expect(offerFilterSchema.safeParse({ mode: "none" }).success).toBe(true);
    expect(offerFilterSchema.safeParse({ combo: "only" }).success).toBe(true);
    expect(offerFilterSchema.safeParse({ items: [] }).success).toBe(false);
    expect(offerFilterSchema.safeParse({ combo: "maybe" }).success).toBe(false);
    expect(
      offerFilterSchema.safeParse({
        mode: "without",
        items: Array.from({ length: 501 }, (_, i) => `I${i}`),
      }).success,
    ).toBe(false);
  });

  it("order-offers request only accepts well-formed pks", () => {
    expect(
      exploreOrderOffersRequestSchema.safeParse({
        pks: ["2026-11-01_235_39_963148"],
      }).success,
    ).toBe(true);
    expect(
      exploreOrderOffersRequestSchema.safeParse({ pks: ["1' OR 1=1"] }).success,
    ).toBe(false);
  });
});

describe("explore URL filters", () => {
  it("round-trips column and offer filters through search params", () => {
    const filter = filterOf({
      brand: {
        combination: "and",
        groups: [
          {
            combination: "and",
            conditions: [
              {
                type: "text",
                operator: "equals",
                selectedValues: new Set(["kfc"]),
              },
            ],
          },
        ],
      },
    });
    const offers = { mode: "with" as const, items: ["OFF1"] };
    const params = new URLSearchParams("from=2026-10-01&to=2026-10-31");
    writeExploreUrlFilters(params, filter, offers);
    expect(params.get("from")).toBe("2026-10-01");
    expect(readExploreUrlFilters(params)).toEqual({ filter, offers });

    writeExploreUrlFilters(params, {}, null);
    expect(params.has("filter")).toBe(false);
    expect(params.has("offers")).toBe(false);
  });

  it("drops malformed or invalid params", () => {
    for (const search of [
      "filter=%7Bnot-json&offers=nope",
      'filter={"nope":1}&offers={"mode":"with","items":[]}',
      "",
    ]) {
      expect(readExploreUrlFilters(new URLSearchParams(search))).toEqual({
        filter: {},
        offers: null,
      });
    }
  });
});

describe("describeExploreFilter", () => {
  const group = (...conditions: unknown[]) => ({
    combination: "and",
    groups: [{ combination: "and", conditions }],
  });

  it("describes set, number, date and blank filters in column order", () => {
    const chips = describeExploreFilter(
      {
        net: group({ type: "number", operator: ">", value: 10 }),
        brand: group({
          type: "text",
          operator: "equals",
          selectedValues: ["kfc", "ph", "bk", ""],
        }),
        day: group({
          type: "date",
          operator: "between",
          value: "2026-10-01",
          valueTo: "2026-10-05",
        }),
        store: group({ type: "text", operator: "notBlank" }),
      },
      (colId, value) => (colId === "brand" ? value.toUpperCase() : value),
    );
    expect(chips).toEqual([
      {
        colId: "day",
        label: "Date",
        text: "between 2026-10-01 and 2026-10-05",
      },
      { colId: "brand", label: "Brand", text: "KFC, PH +2 more" },
      { colId: "store", label: "Store", text: "is not blank" },
      { colId: "net", label: "Net (EUR)", text: "> 10" },
    ]);
  });

  it("returns nothing for an empty or invalid filter", () => {
    expect(describeExploreFilter({}, (_, v) => v)).toEqual([]);
    expect(describeExploreFilter({ nope: 1 }, (_, v) => v)).toEqual([]);
  });
});
