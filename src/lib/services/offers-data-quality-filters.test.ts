import { describe, expect, it } from "vitest";
import {
  appendGapQueueFilters,
  parseGapQueueFilters,
} from "./offers-data-quality";

describe("gap queue filter params", () => {
  it("round-trips through the URL", () => {
    const filters = {
      channels: ["Wolt Only"],
      stores: ["PH STROVOLOS", "KFC LARNACA"],
      cities: ["Nicosia"],
      detectedFrom: "2026-10-01",
      detectedTo: "2026-10-31",
    };
    const params = new URLSearchParams();
    appendGapQueueFilters(params, filters);

    expect(parseGapQueueFilters(params)).toEqual(filters);
  });

  it("drops blank, duplicate and invalid values", () => {
    const params = new URLSearchParams(
      "channel=%20&channel=Bolt&channel=Bolt&from=2026-13-40&to=yesterday",
    );

    expect(parseGapQueueFilters(params)).toEqual({
      channels: ["Bolt"],
      stores: [],
      cities: [],
      detectedFrom: undefined,
      detectedTo: undefined,
    });
  });
});
