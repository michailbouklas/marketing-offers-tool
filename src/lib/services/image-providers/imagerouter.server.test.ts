import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ImageRouterImageProvider,
  ImageRouterProviderError,
} from "./imagerouter.server";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function bytesResponse(bytes: Buffer): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { "content-type": "image/png" },
  });
}

interface RecordedCall {
  url: string;
  init: RequestInit;
}

function recorderFetch(
  calls: RecordedCall[],
  handler: (url: string, init: RequestInit) => Promise<Response> | Response,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const requestInit = init ?? {};
    calls.push({ url, init: requestInit });
    return handler(url, requestInit);
  }) as unknown as typeof fetch;
}

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "imagerouter-provider-"));
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("ImageRouterImageProvider — text-to-image (no references)", () => {
  it("always posts multipart to /v1/openai/images/edits with the expected fields", async () => {
    const expected = Buffer.from([0x89, 0x50]);
    const calls: RecordedCall[] = [];
    const provider = new ImageRouterImageProvider({
      apiKey: "ir-test",
      baseUrl: "https://api.imagerouter.io",
      fetch: recorderFetch(calls, () =>
        jsonResponse({ data: [{ b64_json: expected.toString("base64") }] }),
      ),
    });

    const out = await provider.generateImage({
      prompt: "a fox",
      width: 1024,
      height: 1024,
      model: "openai/gpt-image-1",
    });

    expect(out.bytes.equals(expected)).toBe(true);

    const { url, init } = calls[0]!;
    expect(url).toBe("https://api.imagerouter.io/v1/openai/images/edits");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer ir-test");

    const form = init.body as FormData;
    expect(form.get("model")).toBe("openai/gpt-image-1");
    expect(form.get("prompt")).toBe("a fox");
    expect(form.get("size")).toBe("1024x1024");
    expect(form.get("response_format")).toBe("b64_json");
    expect(form.get("output_format")).toBe("png");
    expect(form.getAll("image[]")).toHaveLength(0);
  });

  it("forwards quality, background, and input_fidelity when provided", async () => {
    const calls: RecordedCall[] = [];
    const provider = new ImageRouterImageProvider({
      apiKey: "ir-test",
      baseUrl: "https://api.imagerouter.io",
      fetch: recorderFetch(calls, () =>
        jsonResponse({
          data: [{ b64_json: Buffer.from("x").toString("base64") }],
        }),
      ),
    });

    await provider.generateImage({
      prompt: "p",
      width: 1024,
      height: 1024,
      quality: "medium",
      background: "transparent",
      inputFidelity: "high",
    });

    const form = calls[0]!.init.body as FormData;
    expect(form.get("quality")).toBe("medium");
    expect(form.get("background")).toBe("transparent");
    expect(form.get("input_fidelity")).toBe("high");
  });

  it("omits the accuracy knobs from the form when not provided", async () => {
    const calls: RecordedCall[] = [];
    const provider = new ImageRouterImageProvider({
      apiKey: "ir-test",
      baseUrl: "https://api.imagerouter.io",
      fetch: recorderFetch(calls, () =>
        jsonResponse({
          data: [{ b64_json: Buffer.from("x").toString("base64") }],
        }),
      ),
    });

    await provider.generateImage({ prompt: "p", width: 1024, height: 1024 });

    const form = calls[0]!.init.body as FormData;
    expect(form.get("quality")).toBeNull();
    expect(form.get("background")).toBeNull();
    expect(form.get("input_fidelity")).toBeNull();
  });

  it("defaults the model to gpt-image-1 when no model is supplied", async () => {
    const calls: RecordedCall[] = [];
    const provider = new ImageRouterImageProvider({
      apiKey: "ir-test",
      baseUrl: "https://api.imagerouter.io",
      fetch: recorderFetch(calls, () =>
        jsonResponse({
          data: [{ b64_json: Buffer.from("x").toString("base64") }],
        }),
      ),
    });

    await provider.generateImage({
      prompt: "p",
      width: 1024,
      height: 1024,
    });

    const form = calls[0]!.init.body as FormData;
    expect(form.get("model")).toBe("gpt-image-1");
  });

  it("falls back to fetching the URL when b64_json is missing", async () => {
    const remoteBytes = Buffer.from([1, 2, 3]);
    const calls: RecordedCall[] = [];
    const provider = new ImageRouterImageProvider({
      apiKey: "ir-test",
      baseUrl: "https://api.imagerouter.io",
      fetch: recorderFetch(calls, (url) => {
        if (url === "https://api.imagerouter.io/v1/openai/images/edits") {
          return jsonResponse({
            data: [{ url: "https://cdn.example.com/ir.png" }],
          });
        }
        if (url === "https://cdn.example.com/ir.png") {
          return bytesResponse(remoteBytes);
        }
        throw new Error(`unexpected URL ${url}`);
      }),
    });

    const out = await provider.generateImage({
      prompt: "p",
      width: 1024,
      height: 1024,
    });

    expect(out.bytes.equals(remoteBytes)).toBe(true);
  });

  it("throws ImageRouterProviderError on 5xx responses", async () => {
    const calls: RecordedCall[] = [];
    const provider = new ImageRouterImageProvider({
      apiKey: "ir-test",
      baseUrl: "https://api.imagerouter.io",
      fetch: recorderFetch(calls, () =>
        jsonResponse({ error: { message: "upstream down" } }, 503),
      ),
    });

    await expect(
      provider.generateImage({ prompt: "p", width: 1024, height: 1024 }),
    ).rejects.toBeInstanceOf(ImageRouterProviderError);
  });

  it("attaches the request snapshot to provider errors", async () => {
    const refA = join(workdir, "a.png");
    writeFileSync(refA, Buffer.from("AAAA"));
    const provider = new ImageRouterImageProvider({
      apiKey: "ir-test",
      baseUrl: "https://api.imagerouter.io",
      // The exact production failure: 200 OK but an empty data array.
      fetch: recorderFetch([], () => jsonResponse({ data: [] })),
    });

    const error = await provider
      .generateImage({
        prompt: "p",
        width: 1024,
        height: 1024,
        model: "google/nano-banana-2",
        references: [refA],
      })
      .then(
        () => null,
        (err: unknown) => err as ImageRouterProviderError,
      );

    expect(error).toBeInstanceOf(ImageRouterProviderError);
    expect(error!.message).toBe(
      "ImageRouter response did not include any data",
    );
    expect(error!.body).toEqual({ data: [] });
    expect(error!.requestSnapshot).toEqual({
      url: "https://api.imagerouter.io/v1/openai/images/edits",
      method: "POST",
      fields: {
        model: "google/nano-banana-2",
        prompt: "p",
        size: "1024x1024",
        response_format: "b64_json",
        output_format: "png",
      },
      references: [{ name: "a.png", contentType: "image/png", sizeBytes: 4 }],
    });
  });

  it("wraps network-level fetch failures with the request snapshot", async () => {
    const provider = new ImageRouterImageProvider({
      apiKey: "ir-test",
      baseUrl: "https://api.imagerouter.io",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    });

    const error = await provider
      .generateImage({ prompt: "p", width: 1024, height: 1024 })
      .then(
        () => null,
        (err: unknown) => err as ImageRouterProviderError,
      );

    expect(error).toBeInstanceOf(ImageRouterProviderError);
    expect(error!.status).toBe(0);
    expect(error!.message).toContain("fetch failed");
    expect(error!.requestSnapshot?.url).toBe(
      "https://api.imagerouter.io/v1/openai/images/edits",
    );
  });
});

describe("ImageRouterImageProvider — with references", () => {
  it("attaches one image[] field per reference", async () => {
    const refA = join(workdir, "a.png");
    const refB = join(workdir, "b.webp");
    writeFileSync(refA, Buffer.from("AAAA"));
    writeFileSync(refB, Buffer.from("WEBP-bytes"));

    const expected = Buffer.from([5, 5, 5]);
    const calls: RecordedCall[] = [];
    const provider = new ImageRouterImageProvider({
      apiKey: "ir-test",
      baseUrl: "https://api.imagerouter.io",
      fetch: recorderFetch(calls, () =>
        jsonResponse({ data: [{ b64_json: expected.toString("base64") }] }),
      ),
    });
    const out = await provider.generateImage({
      prompt: "with refs",
      width: 1024,
      height: 1024,
      references: [refA, refB],
    });

    expect(out.bytes.equals(expected)).toBe(true);

    const form = calls[0]!.init.body as FormData;
    const images = form.getAll("image[]");
    expect(images).toHaveLength(2);
    expect(await (images[0] as Blob).text()).toBe("AAAA");
    expect(await (images[1] as Blob).text()).toBe("WEBP-bytes");
  });

  it("trims a trailing slash from baseUrl", async () => {
    const calls: RecordedCall[] = [];
    const provider = new ImageRouterImageProvider({
      apiKey: "ir-test",
      baseUrl: "https://api.imagerouter.io/",
      fetch: recorderFetch(calls, () =>
        jsonResponse({
          data: [{ b64_json: Buffer.from("x").toString("base64") }],
        }),
      ),
    });

    await provider.generateImage({ prompt: "p", width: 1024, height: 1024 });

    expect(calls[0]!.url).toBe(
      "https://api.imagerouter.io/v1/openai/images/edits",
    );
  });
});
