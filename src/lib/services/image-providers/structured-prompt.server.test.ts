import { describe, expect, it } from "vitest";
import {
  StructuredPromptSuggester,
  StructuredPromptSuggesterError,
} from "./structured-prompt.server";

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

describe("StructuredPromptSuggester", () => {
  it("includes brand guidelines in the user message when provided", async () => {
    const calls: RecordedCall[] = [];
    const suggester = new StructuredPromptSuggester({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, () =>
        chatResponse({ primarySubject: "souvlaki wrap" }),
      ),
    });

    await suggester.suggest(
      "souvlaki wrap on a wooden board",
      "Use warm earthy tones. Never show cutlery.",
    );

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0]!.init.body as string) as {
      messages: { role: string; content: string }[];
      response_format: { type: string };
    };
    expect(body.response_format).toEqual({ type: "json_object" });
    const userMessage = body.messages.find((m) => m.role === "user");
    expect(userMessage?.content).toContain("Brand design guidelines:");
    expect(userMessage?.content).toContain("Never show cutlery.");
    expect(userMessage?.content).toContain("souvlaki wrap on a wooden board");
  });

  it("omits the guidelines section when none are provided", async () => {
    const calls: RecordedCall[] = [];
    const suggester = new StructuredPromptSuggester({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, () =>
        chatResponse({ primarySubject: "souvlaki wrap" }),
      ),
    });

    await suggester.suggest("souvlaki wrap on a wooden board", "   ");

    const body = JSON.parse(calls[0]!.init.body as string) as {
      messages: { role: string; content: string }[];
    };
    const userMessage = body.messages.find((m) => m.role === "user");
    expect(userMessage?.content).not.toContain("Brand design guidelines:");
  });

  it("keeps only well-typed fields from a sloppy model response", async () => {
    const suggester = new StructuredPromptSuggester({
      apiKey: "sk-test",
      fetch: recorderFetch([], () =>
        chatResponse({
          primarySubject: "  glossy burger stack  ",
          materials: ["melted cheese", 42, "  "],
          detailSystems: [
            { object: "steam wisps", state: "rising upward" },
            { object: "", behavior: "scattered" },
            "not-an-object",
          ],
          mood: 7,
        }),
      ),
    });

    const result = await suggester.suggest("burger");

    expect(result.primarySubject).toBe("glossy burger stack");
    expect(result.materials).toEqual(["melted cheese"]);
    // "state" is accepted as an alias for "behavior" (the reference format
    // uses both); incomplete or malformed rows are dropped.
    expect(result.detailSystems).toEqual([
      { object: "steam wisps", behavior: "rising upward" },
    ]);
    expect(result.mood).toBeUndefined();
  });

  it("throws a typed error on non-OK responses", async () => {
    const suggester = new StructuredPromptSuggester({
      apiKey: "sk-test",
      fetch: recorderFetch([], () =>
        Promise.resolve(new Response("{}", { status: 401 })),
      ),
    });

    await expect(suggester.suggest("burger")).rejects.toBeInstanceOf(
      StructuredPromptSuggesterError,
    );
  });
});
