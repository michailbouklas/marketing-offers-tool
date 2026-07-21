import { describe, expect, it, vi } from "vitest";
import { OpenAITextProvider, OpenAITextProviderError } from "./openai.server";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["variants"],
  properties: { variants: { type: "array" } },
};

function makeInput(
  overrides: Partial<Parameters<OpenAITextProvider["generateText"]>[0]> = {},
) {
  return {
    systemPrompt: "You write copy.",
    userPrompt: "Brief: promo",
    jsonSchema: SCHEMA,
    schemaName: "copy_test",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenAITextProvider", () => {
  it("sends a strict json_schema request and parses the content", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: '{"variants":[1]}' } }],
        usage: { total_tokens: 10 },
      }),
    );
    const provider = new OpenAITextProvider({
      apiKey: "key",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const output = await provider.generateText(makeInput({ model: "gpt-4o" }));

    expect(output.content).toEqual({ variants: [1] });
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-4o");
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.name).toBe("copy_test");
  });

  it("throws a snapshot-carrying error on a non-OK response", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { message: "rate limited" } }, 429),
    );
    const provider = new OpenAITextProvider({
      apiKey: "key",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const err = await provider.generateText(makeInput()).catch((e) => e);
    expect(err).toBeInstanceOf(OpenAITextProviderError);
    expect(err.status).toBe(429);
    expect(err.message).toBe("rate limited");
    expect(err.requestSnapshot?.fields.schemaName).toBe("copy_test");
  });

  it("throws when the response content is not valid JSON", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "not json" } }] }),
    );
    const provider = new OpenAITextProvider({
      apiKey: "key",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(provider.generateText(makeInput())).rejects.toThrow(
      /not valid JSON/,
    );
  });

  it("converts network failures into snapshot-carrying errors", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const provider = new OpenAITextProvider({
      apiKey: "key",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const err = await provider.generateText(makeInput()).catch((e) => e);
    expect(err).toBeInstanceOf(OpenAITextProviderError);
    expect(err.status).toBe(0);
    expect(err.requestSnapshot?.url).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });
});
