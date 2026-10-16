import { describe, expect, it } from "vitest";
import type { GoogleAnalyticsScopeEntry } from "$lib/server/mastra/chat-registry";
import {
  resolveGoogleAnalyticsPageContext,
  resolvePageContext,
} from "./chat-page-context";

const scope = ["bk", "KFC"];

describe("resolvePageContext", () => {
  it("returns null for anything that is not an object", () => {
    expect(resolvePageContext(undefined, scope)).toBeNull();
    expect(resolvePageContext("bk", scope)).toBeNull();
    expect(resolvePageContext(["bk"], scope)).toBeNull();
  });

  it("keeps a valid, in-scope context (aliases normalised)", () => {
    expect(
      resolvePageContext(
        { brand: " Kfc ", location: 7, horizon: 14, models: ["blend"] },
        scope,
      ),
    ).toEqual({ brand: "kfc", location: 7, horizon: 14, models: ["blend"] });
  });

  it("drops a brand outside the scope together with its store", () => {
    expect(
      resolvePageContext({ brand: "phcy", location: 7, horizon: 30 }, scope),
    ).toEqual({ brand: null, location: null, horizon: 30, models: [] });
  });

  it("drops a bad horizon and a bad store id without failing the rest", () => {
    expect(
      resolvePageContext(
        { brand: "bk", location: "7", horizon: 10, models: [] },
        scope,
      ),
    ).toEqual({ brand: "bk", location: null, horizon: null, models: [] });
    expect(
      resolvePageContext({ brand: "bk", location: -1, horizon: 7 }, scope),
    ).toMatchObject({ location: null, horizon: 7 });
  });

  it("filters and truncates the model list", () => {
    const result = resolvePageContext(
      {
        brand: "bk",
        models: ["a", 1, "", "b", "c", "d", "e", "f", "g", "x".repeat(65)],
      },
      scope,
    );
    expect(result?.models).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("nulls the brand when the user has no scope at all", () => {
    expect(resolvePageContext({ brand: "bk", location: 3 }, [])).toEqual({
      brand: null,
      location: null,
      horizon: null,
      models: [],
    });
  });
});

const gaScope: GoogleAnalyticsScopeEntry[] = [
  {
    brandId: 22,
    brandName: "Pizza Hut",
    propertyRowId: "row_ph_web",
    propertyId: "111",
    displayName: "Pizza Hut web",
  },
  {
    brandId: 22,
    brandName: "Pizza Hut",
    propertyRowId: "row_ph_app",
    propertyId: "112",
    displayName: "Pizza Hut app",
  },
  {
    brandId: 7,
    brandName: "KFC",
    propertyRowId: "row_kfc",
    propertyId: "222",
    displayName: "KFC web",
  },
];

describe("resolveGoogleAnalyticsPageContext", () => {
  it("returns null for anything that is not an object", () => {
    expect(resolveGoogleAnalyticsPageContext(undefined, gaScope)).toBeNull();
    expect(resolveGoogleAnalyticsPageContext("22", gaScope)).toBeNull();
    expect(resolveGoogleAnalyticsPageContext([22], gaScope)).toBeNull();
  });

  it("keeps a valid, in-scope context (brand given as number or string)", () => {
    expect(
      resolveGoogleAnalyticsPageContext(
        { brand: 22, property: "row_ph_app", range: "7d" },
        gaScope,
      ),
    ).toEqual({ brandId: 22, propertyRowId: "row_ph_app", range: "7d" });
    expect(
      resolveGoogleAnalyticsPageContext(
        { brand: "22", property: "row_ph_web", range: "90d" },
        gaScope,
      ),
    ).toEqual({ brandId: 22, propertyRowId: "row_ph_web", range: "90d" });
  });

  it("drops a brand outside the scope and a property that is not that brand's", () => {
    expect(
      resolveGoogleAnalyticsPageContext(
        { brand: 99, property: "row_kfc", range: "28d" },
        gaScope,
      ),
      // Brand 99 is unknown → null; the property alone still identifies KFC.
    ).toEqual({ brandId: 7, propertyRowId: "row_kfc", range: "28d" });
    expect(
      resolveGoogleAnalyticsPageContext(
        { brand: 22, property: "row_kfc", range: "28d" },
        gaScope,
      ),
    ).toEqual({ brandId: 22, propertyRowId: null, range: "28d" });
  });

  it("drops an unknown property and a bad range without failing the rest", () => {
    expect(
      resolveGoogleAnalyticsPageContext(
        { brand: 7, property: "row_nope", range: "365d" },
        gaScope,
      ),
    ).toEqual({ brandId: 7, propertyRowId: null, range: null });
    expect(
      resolveGoogleAnalyticsPageContext({ brand: 7, property: 5 }, gaScope),
    ).toEqual({ brandId: 7, propertyRowId: null, range: null });
  });

  it("nulls everything but the range when the user has no scope at all", () => {
    expect(
      resolveGoogleAnalyticsPageContext(
        { brand: 22, property: "row_ph_web", range: "7d" },
        [],
      ),
    ).toEqual({ brandId: null, propertyRowId: null, range: "7d" });
  });
});
