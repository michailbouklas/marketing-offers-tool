import { describe, expect, it } from "vitest";
import {
  buildGoogleAnalyticsHref,
  formatDurationSeconds,
  formatPercent,
  normalizeGoogleAnalyticsPropertyId,
  parseGoogleAnalyticsFilters,
  parseGoogleAnalyticsRange,
  parseServiceAccountJson,
} from "./google-analytics";

describe("parseGoogleAnalyticsRange", () => {
  it("accepts the presets and defaults to 28 days", () => {
    expect(parseGoogleAnalyticsRange("7d")).toBe("7d");
    expect(parseGoogleAnalyticsRange("90d")).toBe("90d");
    expect(parseGoogleAnalyticsRange("365d")).toBe("28d");
    expect(parseGoogleAnalyticsRange(null)).toBe("28d");
  });
});

describe("normalizeGoogleAnalyticsPropertyId", () => {
  it("accepts bare and prefixed ids and rejects everything else", () => {
    expect(normalizeGoogleAnalyticsPropertyId("123456789")).toBe("123456789");
    expect(normalizeGoogleAnalyticsPropertyId(" properties/987 ")).toBe("987");
    expect(normalizeGoogleAnalyticsPropertyId("UA-12345-1")).toBeNull();
    expect(normalizeGoogleAnalyticsPropertyId("G-ABC123")).toBeNull();
    expect(normalizeGoogleAnalyticsPropertyId("")).toBeNull();
  });
});

describe("parseServiceAccountJson", () => {
  const valid = {
    type: "service_account",
    project_id: "demo",
    private_key_id: "abc",
    private_key:
      "-----BEGIN PRIVATE KEY-----\nxyz\n-----END PRIVATE KEY-----\n",
    client_email: "reader@demo.iam.gserviceaccount.com",
    client_id: "1",
    token_uri: "https://oauth2.googleapis.com/token",
    universe_domain: "googleapis.com",
  };

  it("keeps only the fields the OAuth flow needs", () => {
    const parsed = parseServiceAccountJson(JSON.stringify(valid));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).toEqual({
        type: "service_account",
        project_id: "demo",
        private_key_id: "abc",
        private_key: valid.private_key,
        client_email: valid.client_email,
        token_uri: valid.token_uri,
      });
      expect("client_id" in parsed.value).toBe(false);
    }
  });

  it("rejects non-JSON, OAuth client files and keys without a PEM", () => {
    expect(parseServiceAccountJson("{not json").ok).toBe(false);
    expect(
      parseServiceAccountJson(
        JSON.stringify({ ...valid, type: "authorized_user" }),
      ).ok,
    ).toBe(false);
    expect(
      parseServiceAccountJson(JSON.stringify({ ...valid, private_key: "x" }))
        .ok,
    ).toBe(false);
  });
});

describe("URL filters", () => {
  it("parses brand/property/range and ignores junk", () => {
    expect(
      parseGoogleAnalyticsFilters(
        new URLSearchParams("brand=12&property=ckx1&range=7d"),
      ),
    ).toEqual({ brandId: 12, propertyId: "ckx1", range: "7d" });
    expect(
      parseGoogleAnalyticsFilters(new URLSearchParams("brand=abc&range=zz")),
    ).toEqual({ brandId: null, propertyId: null, range: "28d" });
  });

  it("omits defaults from the href", () => {
    expect(
      buildGoogleAnalyticsHref("/google-analytics", {
        brandId: 3,
        propertyId: null,
        range: "28d",
      }),
    ).toBe("/google-analytics?brand=3");
    expect(
      buildGoogleAnalyticsHref("/google-analytics", {
        brandId: 3,
        propertyId: "p1",
        range: "90d",
      }),
    ).toBe("/google-analytics?brand=3&property=p1&range=90d");
  });
});

describe("formatting", () => {
  it("formats durations and percentages for the tiles", () => {
    expect(formatDurationSeconds(44.4)).toBe("44s");
    expect(formatDurationSeconds(134.4)).toBe("2m 14s");
    expect(formatDurationSeconds(600)).toBe("10m 00s");
    expect(formatPercent(0.6123)).toBe("61.2%");
  });
});
