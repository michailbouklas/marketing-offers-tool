import { describe, expect, it } from "vitest";
import {
  decodeAggregatorStoreEntityId,
  decodeCompetitionEntityId,
  encodeAggregatorStoreEntityId,
  encodeCompetitionEntityId,
  isBrandEntityType,
  isValidEntityId,
} from "./brand-entities";

describe("brand-entities", () => {
  it("round-trips a competition entityId", () => {
    const entityId = encodeCompetitionEntityId(12, 3456);
    expect(entityId).toBe("12:3456");
    expect(decodeCompetitionEntityId(entityId)).toEqual({
      processorId: 12,
      restaurantId: 3456,
    });
  });

  it("rejects malformed competition entityIds", () => {
    expect(decodeCompetitionEntityId("12")).toBeNull();
    expect(decodeCompetitionEntityId("12:")).toBeNull();
    expect(decodeCompetitionEntityId("a:b")).toBeNull();
    expect(decodeCompetitionEntityId("")).toBeNull();
  });

  it("recognises known entity types", () => {
    expect(isBrandEntityType("competitionRestaurant")).toBe(true);
    expect(isBrandEntityType("googleReviewsBusiness")).toBe(true);
    expect(isBrandEntityType("aggregatorStore")).toBe(true);
    expect(isBrandEntityType("nope")).toBe(false);
    expect(isBrandEntityType(42)).toBe(false);
  });

  it("validates entityIds per type", () => {
    expect(isValidEntityId("competitionRestaurant", "1:2")).toBe(true);
    expect(isValidEntityId("competitionRestaurant", "not-a-pair")).toBe(false);
    // A Google cid is a numeric-looking string and must be accepted verbatim.
    expect(
      isValidEntityId("googleReviewsBusiness", "17926402364648590000"),
    ).toBe(true);
    expect(isValidEntityId("googleReviewsBusiness", "   ")).toBe(false);
    expect(isValidEntityId("aggregatorStore", "FOODY:FY_CY;493")).toBe(true);
    expect(isValidEntityId("aggregatorStore", "BOLT:whatever")).toBe(false);
  });
});

describe("aggregator store entity ids", () => {
  it("round-trips both aggregators' external id shapes", () => {
    // Foody ids contain a semicolon, Wolt ids are hyphenated URL slugs.
    expect(encodeAggregatorStoreEntityId("FOODY", "FY_CY;493")).toBe(
      "FOODY:FY_CY;493",
    );
    expect(decodeAggregatorStoreEntityId("FOODY:FY_CY;493")).toEqual({
      aggregator: "FOODY",
      externalId: "FY_CY;493",
    });

    expect(
      decodeAggregatorStoreEntityId(
        encodeAggregatorStoreEntityId("WOLT", "pizza-hut-strovolos"),
      ),
    ).toEqual({ aggregator: "WOLT", externalId: "pizza-hut-strovolos" });
  });

  it("splits on the first colon only, so a colon in the externalId survives", () => {
    expect(decodeAggregatorStoreEntityId("FOODY:a:b")).toEqual({
      aggregator: "FOODY",
      externalId: "a:b",
    });
  });

  it("rejects malformed aggregator store entityIds", () => {
    // Unknown aggregator: `bolt`/`efood` exist in the offers enum but are not
    // scraped for KPIs, so they must not decode.
    expect(decodeAggregatorStoreEntityId("BOLT:x")).toBeNull();
    expect(decodeAggregatorStoreEntityId("foody:x")).toBeNull();
    expect(decodeAggregatorStoreEntityId("FOODY:")).toBeNull();
    expect(decodeAggregatorStoreEntityId(":x")).toBeNull();
    expect(decodeAggregatorStoreEntityId("FOODY")).toBeNull();
    expect(decodeAggregatorStoreEntityId("")).toBeNull();
  });
});
