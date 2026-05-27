const DEFAULT_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You are a prompt-engineering assistant for a text-to-image tool.

You may be given the active brand's design guidelines. When they are present, use
them to decide whether the prompt fits the brand and to ask sharper, brand-aware
questions (e.g. about palette, tone, typography, or how the brand frames products).

Given the user's draft prompt, do exactly one of the following and reply with JSON:

1. If the prompt is vague, too generic, internally contradictory, or otherwise
   likely to produce a poor or unpredictable image, respond with:
   - "critique": one or two short sentences naming what is weak about the prompt
     and why it may not produce a good result. Reference the brand guidelines when
     they are relevant.
   - "clarifyingQuestions": up to 3 short questions that would meaningfully improve
     the result. For each, include a short "example" answer (a few words) that
     shows the kind of detail you're looking for.
   {"critique": "...", "clarifyingQuestions": [{"question": "...", "example": "..."}]}

2. Otherwise, rewrite the prompt with richer visual detail, suitable for a
   high-quality image model (honoring the brand guidelines when present), and
   respond with:
   {"enhancedPrompt": "..."}

Reply with valid JSON only. Do not include any prose outside the JSON object.`;

export interface ClarifyingQuestion {
  question: string;
  example?: string;
}

export interface EnhanceResult {
  critique?: string;
  clarifyingQuestions?: ClarifyingQuestion[];
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

  async enhance(
    prompt: string,
    brandGuidelines?: string,
  ): Promise<EnhanceResult> {
    const guidelines = brandGuidelines?.trim();
    const userContent = guidelines
      ? `Brand design guidelines:\n${guidelines}\n\nDraft prompt:\n${prompt}`
      : prompt;

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
          { role: "user", content: userContent },
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

  if (typeof obj.critique === "string" && obj.critique.trim()) {
    result.critique = obj.critique.trim();
  }

  const questions = normalizeClarifyingQuestions(obj.clarifyingQuestions);
  if (questions.length > 0) {
    result.clarifyingQuestions = questions;
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

// Accept either plain question strings or {question, example} objects so the
// flow keeps working even when the model ignores the example instruction.
function normalizeClarifyingQuestions(value: unknown): ClarifyingQuestion[] {
  if (!Array.isArray(value)) return [];
  const questions: ClarifyingQuestion[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const question = entry.trim();
      if (question) questions.push({ question });
    } else if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const question =
        typeof record.question === "string" ? record.question.trim() : "";
      if (!question) continue;
      const example =
        typeof record.example === "string" && record.example.trim()
          ? record.example.trim()
          : undefined;
      questions.push(example ? { question, example } : { question });
    }
  }
  return questions;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}
