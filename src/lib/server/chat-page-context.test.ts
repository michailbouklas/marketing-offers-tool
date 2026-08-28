import { describe, expect, it } from "vitest";
import { resolvePageContext } from "./chat-page-context";

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
