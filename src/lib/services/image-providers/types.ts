export interface GenerateInput {
  prompt: string;
  width: number;
  height: number;
  model?: string;
  references?: string[];
}

export interface GenerateOutput {
  bytes: Buffer;
  providerMetadata?: unknown;
}

export interface ImageProvider {
  generateImage(input: GenerateInput): Promise<GenerateOutput>;
}

export interface FakeProviderOptions {
  bytes?: Buffer;
  metadata?: unknown;
  recordCalls?: GenerateInput[];
  error?: Error;
}

export class FakeProvider implements ImageProvider {
  constructor(private readonly options: FakeProviderOptions = {}) {}

  async generateImage(input: GenerateInput): Promise<GenerateOutput> {
    this.options.recordCalls?.push(input);

    if (this.options.error) {
      throw this.options.error;
    }

    const bytes =
      this.options.bytes ??
      Buffer.from(
        `fake:${input.prompt}:${input.width}x${input.height}` +
          (input.model ? `:${input.model}` : "") +
          (input.references?.length ? `:refs(${input.references.length})` : ""),
        "utf8",
      );

    return {
      bytes,
      providerMetadata: this.options.metadata ?? {
        provider: "fake",
        model: input.model ?? "fake-default",
        referenceCount: input.references?.length ?? 0,
      },
    };
  }
}
