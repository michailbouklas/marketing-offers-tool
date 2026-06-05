// Browser-safe contracts for text (copywriting) providers. Mirrors the image
// provider contracts in $lib/services/image-providers/types — the
// ProviderRequestError/ProviderRequestSnapshot shapes are reused so failure
// logging works identically for text and image generations.

export type {
  ProviderRequestError,
  ProviderRequestSnapshot,
} from "$lib/services/image-providers/types";
export { isProviderRequestError } from "$lib/services/image-providers/types";

export interface TextGenerateInput {
  systemPrompt: string;
  userPrompt: string;
  /**
   * JSON Schema the provider must satisfy (OpenAI structured outputs with
   * `strict: true`: every property required, `additionalProperties: false`).
   */
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  model?: string;
  temperature?: number;
}

export interface TextGenerateOutput {
  /** The parsed JSON object returned by the model. */
  content: unknown;
  providerMetadata?: unknown;
}

export interface TextProvider {
  generateText(input: TextGenerateInput): Promise<TextGenerateOutput>;
}

export interface FakeTextProviderOptions {
  content?: unknown;
  metadata?: unknown;
  recordCalls?: TextGenerateInput[];
  error?: Error;
}

export class FakeTextProvider implements TextProvider {
  constructor(private readonly options: FakeTextProviderOptions = {}) {}

  async generateText(input: TextGenerateInput): Promise<TextGenerateOutput> {
    this.options.recordCalls?.push(input);

    if (this.options.error) {
      throw this.options.error;
    }

    return {
      content: this.options.content ?? { variants: [] },
      providerMetadata: this.options.metadata ?? {
        provider: "fake",
        model: input.model ?? "fake-default",
      },
    };
  }
}
