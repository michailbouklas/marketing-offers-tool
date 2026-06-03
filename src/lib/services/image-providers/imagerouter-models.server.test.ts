import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __clearImageRouterModelCapsCache,
  fetchImageRouterModelCaps,
} from "./imagerouter-models.server";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SAMPLE = [
  {
    id: "black-forest-labs/FLUX-1.1-pro",
    output: ["image"],
    inputs: {
      image: false,
      mask: false,
      quality: true,
      size: ["1024x1024", "1024x576", "576x1024"],
    },
  },
];

afterEach(() => {
  __clearImageRouterModelCapsCache();
  vi.restoreAllMocks();
});

describe("fetchImageRouterModelCaps", () => {
  it("requests /v2/models and parses inputs.size + capability flags", async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (url: string) => {
      calls.push(url);
      return jsonResponse(SAMPLE);
    }) as unknown as typeof fetch;

    const caps = await fetchImageRouterModelCaps(
      "https://api.imagerouter.io/",
      {
        fetch: fetchFn,
        now: 1000,
      },
    );

    expect(calls[0]).toBe("https://api.imagerouter.io/v2/models");
    const flux = caps.get("black-forest-labs/FLUX-1.1-pro");
    expect(flux?.sizes).toEqual(["1024x1024", "1024x576", "576x1024"]);
    expect(flux?.quality).toBe(true);
    expect(flux?.image).toBe(false);
    expect(flux?.output).toEqual(["image"]);
  });

  it("accepts a {data:[]} envelope", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ data: SAMPLE }),
    ) as unknown as typeof fetch;

    const caps = await fetchImageRouterModelCaps("https://api.imagerouter.io", {
      fetch: fetchFn,
      now: 2000,
    });
    expect(caps.has("black-forest-labs/FLUX-1.1-pro")).toBe(true);
  });

  it("serves a cached result within the TTL without re-fetching", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(SAMPLE),
    ) as unknown as typeof fetch;

    await fetchImageRouterModelCaps("https://api.imagerouter.io", {
      fetch: fetchFn,
      now: 0,
    });
    await fetchImageRouterModelCaps("https://api.imagerouter.io", {
      fetch: fetchFn,
      now: 60_000, // well within the 1h TTL
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("returns an empty map on a non-OK response", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: "nope" }, 500),
    ) as unknown as typeof fetch;

    const caps = await fetchImageRouterModelCaps("https://api.imagerouter.io", {
      fetch: fetchFn,
      now: 3000,
    });
    expect(caps.size).toBe(0);
  });

  it("returns an empty map when the fetch throws", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const caps = await fetchImageRouterModelCaps("https://api.imagerouter.io", {
      fetch: fetchFn,
      now: 4000,
    });
    expect(caps.size).toBe(0);
  });
});
