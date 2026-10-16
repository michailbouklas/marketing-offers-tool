import { createVerify, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  batchRunReports,
  buildJwtAssertion,
  clearGoogleAnalyticsTokenCache,
  describeGoogleAnalyticsError,
  GA4_BATCH_LIMIT,
  GA4_DEFAULT_TOKEN_URI,
  GA4_READONLY_SCOPE,
  getAccessToken,
  GoogleAnalyticsApiError,
  runReport,
} from "./ga4-client.server";
import type { ServiceAccountCredentials } from "./google-analytics";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const credentials: ServiceAccountCredentials = {
  type: "service_account",
  client_email: "ga-reader@project.iam.gserviceaccount.com",
  private_key: privateKey,
  private_key_id: "key-1",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
}

const fetchMock = vi.fn();
const fetchImpl = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  clearGoogleAnalyticsTokenCache();
});

afterEach(() => {
  fetchMock.mockReset();
});

describe("buildJwtAssertion", () => {
  it("signs RS256 claims for the analytics.readonly scope", () => {
    const now = Date.UTC(2026, 9, 16, 8, 0, 0);
    const assertion = buildJwtAssertion(credentials, now);
    const [header, claims, signature] = assertion.split(".");

    expect(decodeSegment(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decodeSegment(claims)).toEqual({
      iss: credentials.client_email,
      scope: GA4_READONLY_SCOPE,
      aud: GA4_DEFAULT_TOKEN_URI,
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + 3600,
    });

    const verified = createVerify("RSA-SHA256")
      .update(`${header}.${claims}`)
      .verify(publicKey, Buffer.from(signature, "base64url"));
    expect(verified).toBe(true);
  });

  it("uses the key's token_uri as audience when present", () => {
    const assertion = buildJwtAssertion(
      { ...credentials, token_uri: "https://oauth.example.test/token" },
      0,
    );
    expect(decodeSegment<{ aud: string }>(assertion.split(".")[1]).aud).toBe(
      "https://oauth.example.test/token",
    );
  });

  it("maps an unusable private key to a 400 client error", () => {
    expect(() =>
      buildJwtAssertion({ ...credentials, private_key: "garbage" }),
    ).toThrow(GoogleAnalyticsApiError);
    try {
      buildJwtAssertion({ ...credentials, private_key: "garbage" });
    } catch (err) {
      expect((err as GoogleAnalyticsApiError).code).toBe("invalid_private_key");
    }
  });
});

describe("getAccessToken", () => {
  it("exchanges the assertion at the token endpoint and caches the token", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: "tok-1", expires_in: 3600 }),
    );

    const first = await getAccessToken(credentials, fetchImpl);
    const second = await getAccessToken(credentials, fetchImpl);

    expect(first).toBe("tok-1");
    expect(second).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(GA4_DEFAULT_TOKEN_URI);
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    expect(body.get("assertion")?.split(".")).toHaveLength(3);
  });

  it("surfaces invalid_grant from Google as a typed error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: "invalid_grant", error_description: "Invalid JWT Signature." },
        400,
      ),
    );

    await expect(getAccessToken(credentials, fetchImpl)).rejects.toMatchObject({
      name: "GoogleAnalyticsApiError",
      status: 400,
      code: "invalid_grant",
      message: "Invalid JWT Signature.",
    });
  });

  it("reports an unreachable token endpoint as 503", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(getAccessToken(credentials, fetchImpl)).rejects.toMatchObject({
      status: 503,
      code: "token_endpoint_unreachable",
    });
  });
});

describe("reports", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: "tok", expires_in: 3600 }),
    );
  });

  it("posts runReport with a bearer token to the property path", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ rows: [], rowCount: 0, kind: "analyticsData#runReport" }),
    );

    const request = {
      metrics: [{ name: "activeUsers" }],
      dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
    };
    const report = await runReport("123456", request, credentials, fetchImpl);

    expect(report.rowCount).toBe(0);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(
      "https://analyticsdata.googleapis.com/v1beta/properties/123456:runReport",
    );
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer tok",
    );
    expect(JSON.parse(init.body as string)).toEqual(request);
  });

  it("maps a Data API permission error to its status + Google status code", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: 403,
            message:
              "User does not have sufficient permissions for this property.",
            status: "PERMISSION_DENIED",
          },
        },
        403,
      ),
    );

    await expect(
      runReport(
        "123456",
        { metrics: [{ name: "sessions" }], dateRanges: [] },
        credentials,
        fetchImpl,
      ),
    ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
  });

  it("batches up to the API limit and returns reports in order", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ reports: [{ rowCount: 1 }, { rowCount: 2 }] }),
    );

    const requests = Array.from({ length: 2 }, () => ({
      metrics: [{ name: "sessions" }],
      dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
    }));
    const reports = await batchRunReports(
      "123456",
      requests,
      credentials,
      fetchImpl,
    );

    expect(reports.map((report) => report.rowCount)).toEqual([1, 2]);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("properties/123456:batchRunReports");
    expect(JSON.parse(init.body as string)).toEqual({ requests });
  });

  it("refuses batches above the API limit without calling Google", async () => {
    const requests = Array.from({ length: GA4_BATCH_LIMIT + 1 }, () => ({
      metrics: [{ name: "sessions" }],
      dateRanges: [],
    }));

    await expect(
      batchRunReports("1", requests, credentials, fetchImpl),
    ).rejects.toMatchObject({ code: "batch_too_large" });
    // Only the token call from beforeEach was queued; nothing consumed it.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("describeGoogleAnalyticsError", () => {
  it("tells admins what to do for the common failures", () => {
    expect(
      describeGoogleAnalyticsError(
        new GoogleAnalyticsApiError(403, "PERMISSION_DENIED", "denied"),
      ),
    ).toContain("Viewer");
    expect(
      describeGoogleAnalyticsError(
        new GoogleAnalyticsApiError(400, "invalid_grant", "bad sig"),
      ),
    ).toContain("Re-upload");
    expect(
      describeGoogleAnalyticsError(
        new GoogleAnalyticsApiError(429, "RESOURCE_EXHAUSTED", "quota"),
      ),
    ).toContain("quota");
    expect(describeGoogleAnalyticsError(new Error("boom"))).toBe("boom");
  });
});
