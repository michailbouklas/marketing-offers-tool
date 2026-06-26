import { describe, expect, it } from "vitest";
import {
  decodeCompetitionEntityId,
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
  });
});
