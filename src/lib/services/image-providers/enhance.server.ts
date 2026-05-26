const DEFAULT_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You are a prompt-engineering assistant for a text-to-image tool.

Given the user's draft prompt, do exactly one of the following and reply with JSON:

1. If the prompt is vague, ambiguous, or missing important detail (subject,
   setting, style, mood, lighting, composition), respond with up to 3 short
   clarifying questions that would meaningfully improve the result:
   {"clarifyingQuestions": ["...", "..."]}

2. Otherwise, rewrite the prompt with richer visual detail, suitable for a
   high-quality image model, and respond with:
   {"enhancedPrompt": "..."}

Reply with valid JSON only. Do not include any prose outside the JSON object.`;

export interface EnhanceResult {
  clarifyingQuestions?: string[];
  enhancedPrompt?: string;
}

export interface PromptEnhancerOptions {
  apiKey: string;
  fetch?: typeof fetch;
  model?: string;
  baseUrl?: string;
}

export class PromptEnhancerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "PromptEnhancerError";
  }
}

export class PromptEnhancer {
  private readonly fetchFn: typeof fetch;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(private readonly options: PromptEnhancerOptions) {
    this.fetchFn = options.fetch ?? fetch;
    this.model = options.model ?? DEFAULT_MODEL;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com";
  }

  async enhance(prompt: string): Promise<EnhanceResult> {
    const response = await this.fetchFn(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const body = await safeJson(response);
      throw new PromptEnhancerError(
        `Prompt enhancement request failed: ${response.status} ${response.statusText}`,
        response.status,
        body,
      );
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new PromptEnhancerError(
        "Prompt enhancement returned an empty choice",
        response.status,
        json,
      );
    }

    return parseEnhanceContent(content);
  }
}

function parseEnhanceContent(content: string): EnhanceResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new PromptEnhancerError(
      "Prompt enhancement returned non-JSON content",
      200,
      content,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new PromptEnhancerError(
      "Prompt enhancement JSON is not an object",
      200,
      parsed,
    );
  }

  const obj = parsed as Record<string, unknown>;
  const result: EnhanceResult = {};

  if (
    Array.isArray(obj.clarifyingQuestions) &&
    obj.clarifyingQuestions.every((q) => typeof q === "string")
  ) {
    result.clarifyingQuestions = obj.clarifyingQuestions as string[];
  }

  if (typeof obj.enhancedPrompt === "string" && obj.enhancedPrompt.trim()) {
    result.enhancedPrompt = obj.enhancedPrompt;
  }

  if (!result.clarifyingQuestions && !result.enhancedPrompt) {
    throw new PromptEnhancerError(
      "Prompt enhancement JSON did not contain clarifyingQuestions or enhancedPrompt",
      200,
      obj,
    );
  }

  return result;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}
