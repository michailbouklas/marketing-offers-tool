import type {
  ProviderRequestError,
  ProviderRequestSnapshot,
  TextGenerateInput,
  TextGenerateOutput,
  TextProvider,
} from "./types";

const OPENAI_BASE_URL = "https://api.openai.com";
const DEFAULT_MODEL = "gpt-4o-mini";

export class OpenAITextProviderError
  extends Error
  implements ProviderRequestError
{
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
    readonly requestSnapshot?: ProviderRequestSnapshot,
  ) {
    super(message);
    this.name = "OpenAITextProviderError";
  }
}

interface OpenAIChatResponse {
  choices?: { message?: { content?: string; refusal?: string } }[];
  usage?: unknown;
  error?: { message?: string };
}

export interface OpenAITextProviderOptions {
  apiKey: string;
  fetch?: typeof fetch;
  baseUrl?: string;
}

/**
 * Chat-completions provider using OpenAI structured outputs
 * (`response_format: json_schema`, `strict: true`) so the returned content is
 * guaranteed to parse against the caller's schema.
 */
export class OpenAITextProvider implements TextProvider {
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: OpenAITextProviderOptions) {
    this.fetchFn = options.fetch ?? fetch;
    this.baseUrl = options.baseUrl ?? OPENAI_BASE_URL;
  }

  async generateText(input: TextGenerateInput): Promise<TextGenerateOutput> {
    const model = input.model ?? DEFAULT_MODEL;
    const url = `${this.baseUrl}/v1/chat/completions`;

    const body = {
      model,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: input.schemaName,
          strict: true,
          schema: input.jsonSchema,
        },
      },
      ...(input.temperature !== undefined
        ? { temperature: input.temperature }
        : {}),
    };

    // Prompts are plain text, so the full request is snapshot-safe — failures
    // can be replayed/inspected from the failure log alone.
    const snapshot: ProviderRequestSnapshot = {
      url,
      method: "POST",
      fields: {
        model,
        schemaName: input.schemaName,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
      },
      references: [],
    };

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new OpenAITextProviderError(
        `OpenAI text request failed before a response was received: ${message}`,
        0,
        null,
        snapshot,
      );
    }

    if (!response.ok) {
      const errorBody = await safeJson(response);
      const message =
        (errorBody as OpenAIChatResponse | null)?.error?.message ??
        `OpenAI text request failed: ${response.status} ${response.statusText}`;
      throw new OpenAITextProviderError(
        message,
        response.status,
        errorBody,
        snapshot,
      );
    }

    const json = (await response.json()) as OpenAIChatResponse;
    const choice = json.choices?.[0]?.message;
    if (choice?.refusal) {
      throw new OpenAITextProviderError(
        `OpenAI refused the request: ${choice.refusal}`,
        response.status,
        json,
        snapshot,
      );
    }
    const content = choice?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new OpenAITextProviderError(
        "OpenAI text response returned an empty choice",
        response.status,
        json,
        snapshot,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new OpenAITextProviderError(
        "OpenAI text response was not valid JSON",
        response.status,
        content,
        snapshot,
      );
    }

    return {
      content: parsed,
      providerMetadata: { provider: "openai", model, usage: json.usage },
    };
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}
