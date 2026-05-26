import { describe, expect, it } from "vitest";
import { PromptEnhancer, PromptEnhancerError } from "./enhance.server";

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

function chatResponse(jsonContent: object, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(jsonContent) } }],
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

describe("PromptEnhancer", () => {
  it("returns clarifyingQuestions when the model asks for clarification", async () => {
    const calls: RecordedCall[] = [];
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, () =>
        chatResponse({
          clarifyingQuestions: ["What lighting?", "Indoor or outdoor?"],
        }),
      ),
    });

    const result = await enhancer.enhance("a cat");

    expect(result.clarifyingQuestions).toEqual([
      "What lighting?",
      "Indoor or outdoor?",
    ]);
    expect(result.enhancedPrompt).toBeUndefined();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[1].content).toBe("a cat");
  });

  it("returns enhancedPrompt when the model rewrites the prompt", async () => {
    const calls: RecordedCall[] = [];
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, () =>
        chatResponse({
          enhancedPrompt:
            "A photorealistic studio shot of a black cat, soft natural light, shallow depth of field",
        }),
      ),
    });

    const result = await enhancer.enhance(
      "a black cat in a sunny studio with a soft natural light",
    );

    expect(result.enhancedPrompt).toMatch(/photorealistic studio/);
    expect(result.clarifyingQuestions).toBeUndefined();
  });

  it("throws PromptEnhancerError on 4xx/5xx responses", async () => {
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch(
        [],
        () =>
          new Response(JSON.stringify({ error: { message: "rate limited" } }), {
            status: 429,
            headers: { "content-type": "application/json" },
          }),
      ),
    });

    await expect(enhancer.enhance("hi")).rejects.toBeInstanceOf(
      PromptEnhancerError,
    );
  });

  it("throws when the JSON content is malformed", async () => {
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch(
        [],
        () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: "not-json" } }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    });

    await expect(enhancer.enhance("hi")).rejects.toBeInstanceOf(
      PromptEnhancerError,
    );
  });

  it("throws when neither field is present in the model output", async () => {
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch([], () => chatResponse({ junk: true })),
    });

    await expect(enhancer.enhance("hi")).rejects.toBeInstanceOf(
      PromptEnhancerError,
    );
  });
});
