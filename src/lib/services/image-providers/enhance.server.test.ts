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
  it("returns clarifyingQuestions with examples when the model asks for clarification", async () => {
    const calls: RecordedCall[] = [];
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, () =>
        chatResponse({
          clarifyingQuestions: [
            { question: "What lighting?", example: "warm sunset light" },
            { question: "Indoor or outdoor?", example: "a cozy living room" },
          ],
        }),
      ),
    });

    const result = await enhancer.enhance("a cat");

    expect(result.clarifyingQuestions).toEqual([
      { question: "What lighting?", example: "warm sunset light" },
      { question: "Indoor or outdoor?", example: "a cozy living room" },
    ]);
    expect(result.enhancedPrompt).toBeUndefined();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[1].content).toBe("a cat");
  });

  it("returns a critique alongside questions and forwards brand guidelines", async () => {
    const calls: RecordedCall[] = [];
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, () =>
        chatResponse({
          critique: "Too generic — no subject, palette, or composition.",
          clarifyingQuestions: [
            { question: "Which brand color leads?", example: "navy blue" },
          ],
        }),
      ),
    });

    const result = await enhancer.enhance("a banner", "Primary color: navy.");

    expect(result.critique).toBe(
      "Too generic — no subject, palette, or composition.",
    );
    expect(result.clarifyingQuestions).toEqual([
      { question: "Which brand color leads?", example: "navy blue" },
    ]);

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.messages[1].content).toContain("Primary color: navy.");
    expect(body.messages[1].content).toContain("a banner");
  });

  it("normalizes plain-string clarifyingQuestions into objects", async () => {
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch([], () =>
        chatResponse({
          clarifyingQuestions: ["What lighting?", "Indoor or outdoor?"],
        }),
      ),
    });

    const result = await enhancer.enhance("a cat");

    expect(result.clarifyingQuestions).toEqual([
      { question: "What lighting?" },
      { question: "Indoor or outdoor?" },
    ]);
  });

  it("sends reference images as multimodal content alongside the text", async () => {
    const calls: RecordedCall[] = [];
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, () =>
        chatResponse({ enhancedPrompt: "taco in a box on an office desk" }),
      ),
    });

    const result = await enhancer.enhance("put it in a box", undefined, [
      "data:image/png;base64,AAA",
      "data:image/webp;base64,BBB",
    ]);

    expect(result.enhancedPrompt).toBe("taco in a box on an office desk");

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages[1].content).toEqual([
      { type: "text", text: "put it in a box" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
      { type: "image_url", image_url: { url: "data:image/webp;base64,BBB" } },
    ]);
  });

  it("keeps content a plain string when no reference images are passed", async () => {
    const calls: RecordedCall[] = [];
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, () => chatResponse({ enhancedPrompt: "ok" })),
    });

    await enhancer.enhance("a cat", undefined, []);

    const body = JSON.parse(calls[0]!.init.body as string);
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

  describe("enhanceWithClarifications", () => {
    it("rewrites the prompt using the original prompt and structured Q&A, never re-asking", async () => {
      const calls: RecordedCall[] = [];
      const enhancer = new PromptEnhancer({
        apiKey: "sk-test",
        fetch: recorderFetch(calls, () =>
          chatResponse({
            enhancedPrompt:
              "A juicy taco filled with grilled chicken and onions, set inside a vibrant Taco Bell restaurant under bold colourful lighting",
          }),
        ),
      });

      const result = await enhancer.enhanceWithClarifications(
        "an image of a juicy taco",
        [
          {
            question: "What specific ingredients do you want to highlight?",
            answer: "chicken and onions",
          },
          {
            question: "What kind of environment?",
            answer: "a taco bell restaurant",
          },
          { question: "What lighting style?", answer: "vibrant colors" },
        ],
        "Brand: Taco Bell. Use bold, vibrant purple and magenta tones.",
      );

      expect(result.enhancedPrompt).toMatch(/chicken and onions/);
      expect(result.enhancedPrompt).not.toMatch(/Clarifications:/i);
      expect(result.clarifyingQuestions).toBeUndefined();
      expect(result.critique).toBeUndefined();

      expect(calls).toHaveLength(1);
      const body = JSON.parse(calls[0]!.init.body as string);
      // Uses the dedicated rewrite system prompt, not the dual-mode one.
      expect(body.messages[0].content).toContain(
        "Do NOT ask any further questions",
      );
      expect(body.messages[0].content).toContain(
        'Do NOT prepend or append a separate "Clarifications:" section',
      );
      // User message includes the original prompt, the brand guidelines, and
      // each Q/A pair as structured context.
      expect(body.messages[1].content).toContain("Original draft prompt:");
      expect(body.messages[1].content).toContain("an image of a juicy taco");
      expect(body.messages[1].content).toContain("Brand design guidelines:");
      expect(body.messages[1].content).toContain("Brand: Taco Bell.");
      expect(body.messages[1].content).toContain("Q: What lighting style?");
      expect(body.messages[1].content).toContain("A: vibrant colors");
    });

    it("strips clarifyingQuestions and critique from the model output even if leaked", async () => {
      const enhancer = new PromptEnhancer({
        apiKey: "sk-test",
        fetch: recorderFetch([], () =>
          chatResponse({
            enhancedPrompt: "A vivid taco scene with chicken and onions",
            critique: "still vague",
            clarifyingQuestions: [{ question: "leftover question?" }],
          }),
        ),
      });

      const result = await enhancer.enhanceWithClarifications("a taco", [
        { question: "Ingredients?", answer: "chicken" },
      ]);

      expect(result).toEqual({
        enhancedPrompt: "A vivid taco scene with chicken and onions",
      });
    });

    it("throws when the rewrite path returns no enhancedPrompt", async () => {
      const enhancer = new PromptEnhancer({
        apiKey: "sk-test",
        fetch: recorderFetch([], () =>
          chatResponse({
            clarifyingQuestions: [{ question: "still unclear?" }],
          }),
        ),
      });

      await expect(
        enhancer.enhanceWithClarifications("a taco", [
          { question: "Ingredients?", answer: "chicken" },
        ]),
      ).rejects.toBeInstanceOf(PromptEnhancerError);
    });

    it("falls back to the standard enhance pass when no usable answers are provided", async () => {
      const calls: RecordedCall[] = [];
      const enhancer = new PromptEnhancer({
        apiKey: "sk-test",
        fetch: recorderFetch(calls, () =>
          chatResponse({ enhancedPrompt: "rewritten" }),
        ),
      });

      const result = await enhancer.enhanceWithClarifications("a taco", [
        { question: "Ingredients?", answer: "   " },
        { question: "", answer: "ignored" },
      ]);

      expect(result.enhancedPrompt).toBe("rewritten");
      const body = JSON.parse(calls[0]!.init.body as string);
      // Used the standard system prompt, not the rewrite-with-clarifications one.
      expect(body.messages[0].content).toContain(
        "do exactly one of the following",
      );
      expect(body.messages[1].content).toBe("a taco");
    });

    it("forwards reference images on the rewrite path", async () => {
      const calls: RecordedCall[] = [];
      const enhancer = new PromptEnhancer({
        apiKey: "sk-test",
        fetch: recorderFetch(calls, () =>
          chatResponse({ enhancedPrompt: "ok" }),
        ),
      });

      await enhancer.enhanceWithClarifications(
        "put it in a box",
        [{ question: "Where?", answer: "an office desk" }],
        undefined,
        ["data:image/png;base64,AAA"],
      );

      const body = JSON.parse(calls[0]!.init.body as string);
      expect(Array.isArray(body.messages[1].content)).toBe(true);
      expect(body.messages[1].content[0].type).toBe("text");
      expect(body.messages[1].content[1]).toEqual({
        type: "image_url",
        image_url: { url: "data:image/png;base64,AAA" },
      });
    });
  });
});
