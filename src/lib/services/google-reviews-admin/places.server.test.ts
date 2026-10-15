import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/env", () => ({
  getGooglePlacesApiUrl: vi.fn(),
}));

const env = await import("$lib/server/env");
const { GooglePlacesApiError } = await import("./places");
const { createGooglePlacesClient, listScrapeQueriesPage } =
  await import("./places.server");

const getUrlMock = vi.mocked(env.getGooglePlacesApiUrl);

type Call = { url: string; init: RequestInit | undefined };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeClient(responder: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const client = createGooglePlacesClient({
    baseUrl: "http://places.test/",
    fetchFn: async (url, init) => {
      const call = { url, init };
      calls.push(call);
      return responder(call);
    },
  });

  return { client, calls };
}

const apiRow = {
  id: 7,
  query: "PAUL Nicosia",
  enabled: true,
  brand_id: 8,
  notes: null,
  last_scraped_at: null,
  last_run_id: null,
  created_at: "2026-10-14T12:00:00.000Z",
  updated_at: "2026-10-14T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createGooglePlacesClient", () => {
  it("lists a page with limit/offset/search/enabled and camel-cases rows", async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse(200, {
        success: true,
        data: [apiRow],
        pagination: { limit: 50, offset: 50, total: 120 },
      }),
    );

    const page = await client.listScrapeQueriesPage({
      page: 2,
      pageSize: 50,
      search: " coffee ",
      status: "disabled",
    });

    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe("http://places.test/scrape-queries");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: "50",
      offset: "50",
      search: "coffee",
      enabled: "false",
      order_by: "id",
      order_direction: "ASC",
    });
    expect(calls[0].init?.method).toBe("GET");

    expect(page).toEqual({
      items: [
        {
          id: 7,
          query: "PAUL Nicosia",
          enabled: true,
          brandId: 8,
          notes: null,
          lastScrapedAt: null,
          lastRunId: null,
          createdAt: "2026-10-14T12:00:00.000Z",
          updatedAt: "2026-10-14T12:00:00.000Z",
        },
      ],
      page: 2,
      pageSize: 50,
      totalItems: 120,
      totalPages: 3,
    });
  });

  it("omits search and enabled for the default filter", async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse(200, { success: true, data: [], pagination: { total: 0 } }),
    );

    const page = await client.listScrapeQueriesPage({
      page: 1,
      pageSize: 50,
      search: null,
      status: "all",
    });

    const params = new URL(calls[0].url).searchParams;
    expect(params.has("search")).toBe(false);
    expect(params.has("enabled")).toBe(false);
    expect(page.totalPages).toBe(1);
  });

  it("creates with a JSON body and returns the created row", async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse(201, { success: true, data: apiRow }),
    );

    const row = await client.createScrapeQuery({
      query: "  PAUL Nicosia ",
      enabled: true,
      brandId: 8,
      notes: "   ",
    });

    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.headers).toMatchObject({
      "content-type": "application/json",
    });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      query: "PAUL Nicosia",
      enabled: true,
      brand_id: 8,
      notes: null,
    });
    expect(row.id).toBe(7);
  });

  it("updates by id and sends brand_id null to unlink", async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse(200, {
        success: true,
        data: { ...apiRow, brand_id: null, enabled: false },
      }),
    );

    const row = await client.updateScrapeQuery(7, {
      query: "PAUL Nicosia centre",
      enabled: false,
      brandId: null,
      notes: "Paused",
    });

    expect(calls[0].url).toBe("http://places.test/scrape-queries/7");
    expect(calls[0].init?.method).toBe("PUT");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      query: "PAUL Nicosia centre",
      enabled: false,
      brand_id: null,
      notes: "Paused",
    });
    expect(row.brandId).toBeNull();
    expect(row.enabled).toBe(false);
  });

  it("deletes by id", async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse(200, { success: true, message: "deleted" }),
    );

    await client.deleteScrapeQuery(7);

    expect(calls[0].url).toBe("http://places.test/scrape-queries/7");
    expect(calls[0].init?.method).toBe("DELETE");
  });

  it("lists brands sorted by title", async () => {
    const { client } = makeClient(() =>
      jsonResponse(200, {
        success: true,
        data: [
          { id: 8, title: "Paul", slug: "paul" },
          { id: 3, title: "KFC", slug: "kfc" },
        ],
      }),
    );

    await expect(client.listBrands()).resolves.toEqual([
      { remoteId: 3, title: "KFC", appBrandId: null },
      { remoteId: 8, title: "Paul", appBrandId: null },
    ]);
  });

  it("maps an API error envelope to GooglePlacesApiError", async () => {
    const { client } = makeClient(() =>
      jsonResponse(400, {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Duplicate query" },
      }),
    );

    const error = await client
      .createScrapeQuery({
        query: "dup",
        enabled: true,
        brandId: null,
        notes: "",
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GooglePlacesApiError);
    expect(error).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Duplicate query",
    });
  });

  it("maps the live server's flat error shape too", async () => {
    const { client } = makeClient(() =>
      jsonResponse(400, {
        error: true,
        message: 'Query "Coffee Island cyprus" already exists (id 1)',
        errorCode: "CREATE_SCRAPE_QUERY_ERROR",
        suggestedAction: "Check your input and try again",
      }),
    );

    await expect(
      client.createScrapeQuery({
        query: "Coffee Island cyprus",
        enabled: true,
        brandId: null,
        notes: "",
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "CREATE_SCRAPE_QUERY_ERROR",
      message: 'Query "Coffee Island cyprus" already exists (id 1)',
    });
  });

  it("falls back to a generic message when the error body is not JSON", async () => {
    const { client } = makeClient(
      () => new Response("gateway timeout", { status: 504 }),
    );

    await expect(client.deleteScrapeQuery(1)).rejects.toMatchObject({
      status: 504,
      code: "HTTP_504",
    });
  });

  it("reports a 503 when fetch itself fails", async () => {
    const { client } = makeClient(() => {
      throw new TypeError("fetch failed");
    });

    await expect(client.listBrands()).rejects.toMatchObject({
      status: 503,
      code: "UNREACHABLE",
    });
  });

  it("treats a non-success envelope as an invalid response", async () => {
    const { client } = makeClient(() => jsonResponse(200, { success: false }));

    await expect(client.listBrands()).rejects.toMatchObject({
      status: 502,
      code: "INVALID_RESPONSE",
    });
  });
});

describe("env-bound helpers", () => {
  it("fail with NOT_CONFIGURED when GOOGLE_PLACES_API is unset", async () => {
    getUrlMock.mockReturnValue(undefined);

    await expect(
      listScrapeQueriesPage({
        page: 1,
        pageSize: 50,
        search: null,
        status: "all",
      }),
    ).rejects.toMatchObject({ status: 503, code: "NOT_CONFIGURED" });
  });
});
