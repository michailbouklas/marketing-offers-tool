import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenAIImageProvider, OpenAIProviderError } from "./openai.server";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function bytesResponse(bytes: Buffer, status = 200): Response {
  return new Response(new Uint8Array(bytes), {
    status,
    headers: { "content-type": "image/png" },
  });
}

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "openai-provider-"));
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

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

describe("OpenAIImageProvider — text-to-image (no references)", () => {
  it("posts JSON to /v1/images/generations and returns bytes from b64_json", async () => {
    const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const calls: RecordedCall[] = [];
    const provider = new OpenAIImageProvider({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, () =>
        jsonResponse({ data: [{ b64_json: expected.toString("base64") }] }),
      ),
    });

    const out = await provider.generateImage({
      prompt: "a green cube",
      width: 1024,
      height: 1024,
    });

    expect(out.bytes.equals(expected)).toBe(true);

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer sk-test");
    expect(headers.get("content-type")).toMatch(/application\/json/);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "gpt-image-1",
      prompt: "a green cube",
      size: "1024x1024",
      n: 1,
    });
  });

  it("includes quality and background in the generations body", async () => {
    const calls: RecordedCall[] = [];
    const provider = new OpenAIImageProvider({
      apiKey: "sk-test",
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
      quality: "high",
      background: "opaque",
    });

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.quality).toBe("high");
    expect(body.background).toBe("opaque");
  });

  it("forces output_format png when background is transparent", async () => {
    const calls: RecordedCall[] = [];
    const provider = new OpenAIImageProvider({
      apiKey: "sk-test",
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
      background: "transparent",
    });

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.background).toBe("transparent");
    expect(body.output_format).toBe("png");
  });

  it("respects an explicit model override", async () => {
    const calls: RecordedCall[] = [];
    const provider = new OpenAIImageProvider({
      apiKey: "sk-test",
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
      model: "gpt-image-2-custom",
    });

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.model).toBe("gpt-image-2-custom");
  });

  it("falls back to fetching the URL when b64_json is missing", async () => {
    const remoteBytes = Buffer.from([1, 2, 3, 4, 5]);
    const calls: RecordedCall[] = [];
    const provider = new OpenAIImageProvider({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, (url) => {
        if (url === "https://api.openai.com/v1/images/generations") {
          return jsonResponse({
            data: [{ url: "https://cdn.example.com/img.png" }],
          });
        }
        if (url === "https://cdn.example.com/img.png") {
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
    expect(calls).toHaveLength(2);
  });

  it("throws OpenAIProviderError on 4xx responses", async () => {
    const calls: RecordedCall[] = [];
    const provider = new OpenAIImageProvider({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, () =>
        jsonResponse({ error: { message: "bad prompt" } }, 400),
      ),
    });

    await expect(
      provider.generateImage({ prompt: "p", width: 1024, height: 1024 }),
    ).rejects.toBeInstanceOf(OpenAIProviderError);
  });

  it("attaches the request snapshot to provider errors", async () => {
    const provider = new OpenAIImageProvider({
      apiKey: "sk-test",
      fetch: recorderFetch([], () =>
        jsonResponse({ error: { message: "bad prompt" } }, 400),
      ),
    });

    const error = await provider
      .generateImage({ prompt: "p", width: 1024, height: 1024 })
      .then(
        () => null,
        (err: unknown) => err as OpenAIProviderError,
      );

    expect(error).toBeInstanceOf(OpenAIProviderError);
    expect(error!.status).toBe(400);
    expect(error!.body).toEqual({ error: { message: "bad prompt" } });
    expect(error!.requestSnapshot).toEqual({
      url: "https://api.openai.com/v1/images/generations",
      method: "POST",
      fields: {
        model: "gpt-image-1",
        prompt: "p",
        size: "1024x1024",
        n: "1",
      },
      references: [],
    });
  });

  it("wraps network-level fetch failures with the request snapshot", async () => {
    const provider = new OpenAIImageProvider({
      apiKey: "sk-test",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    });

    const error = await provider
      .generateImage({ prompt: "p", width: 1024, height: 1024 })
      .then(
        () => null,
        (err: unknown) => err as OpenAIProviderError,
      );

    expect(error).toBeInstanceOf(OpenAIProviderError);
    expect(error!.status).toBe(0);
    expect(error!.message).toContain("fetch failed");
    expect(error!.requestSnapshot?.url).toBe(
      "https://api.openai.com/v1/images/generations",
    );
  });
});

describe("OpenAIImageProvider — with references", () => {
  it("posts multipart to /v1/images/edits with one image[] field per reference", async () => {
    const refA = join(workdir, "ref-a.png");
    const refB = join(workdir, "ref-b.png");
    writeFileSync(refA, Buffer.from("AAAA"));
    writeFileSync(refB, Buffer.from("BBBB"));

    const expected = Buffer.from([9, 9, 9]);
    const calls: RecordedCall[] = [];
    const provider = new OpenAIImageProvider({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, () =>
        jsonResponse({ data: [{ b64_json: expected.toString("base64") }] }),
      ),
    });
    const out = await provider.generateImage({
      prompt: "edit it",
      width: 1024,
      height: 1024,
      references: [refA, refB],
    });

    expect(out.bytes.equals(expected)).toBe(true);

    const { url, init } = calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/images/edits");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);

    const form = init.body as FormData;
    expect(form.get("model")).toBe("gpt-image-1");
    expect(form.get("prompt")).toBe("edit it");
    expect(form.get("size")).toBe("1024x1024");
    const images = form.getAll("image[]");
    expect(images).toHaveLength(2);
    expect(images[0]).toBeInstanceOf(Blob);
    expect(images[1]).toBeInstanceOf(Blob);
    expect(await (images[0] as Blob).text()).toBe("AAAA");
    expect(await (images[1] as Blob).text()).toBe("BBBB");
  });

  it("forwards quality, background, and input_fidelity on the edits form", async () => {
    const ref = join(workdir, "ref.png");
    writeFileSync(ref, Buffer.from("AAAA"));

    const calls: RecordedCall[] = [];
    const provider = new OpenAIImageProvider({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, () =>
        jsonResponse({
          data: [{ b64_json: Buffer.from("x").toString("base64") }],
        }),
      ),
    });
    await provider.generateImage({
      prompt: "edit it",
      width: 1024,
      height: 1024,
      references: [ref],
      quality: "high",
      background: "transparent",
      inputFidelity: "high",
    });

    const form = calls[0]!.init.body as FormData;
    expect(form.get("quality")).toBe("high");
    expect(form.get("background")).toBe("transparent");
    expect(form.get("output_format")).toBe("png");
    expect(form.get("input_fidelity")).toBe("high");
  });
});
