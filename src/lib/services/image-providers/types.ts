export type ImageQuality = "auto" | "low" | "medium" | "high";
export type ImageBackground = "auto" | "opaque" | "transparent";
export type InputFidelity = "high" | "low";

export interface GenerateInput {
  prompt: string;
  width: number;
  height: number;
  model?: string;
  references?: string[];
  /** Provider fidelity tier. Maps to OpenAI `quality`. */
  quality?: ImageQuality;
  /** Background handling. Maps to OpenAI `background` (transparent/opaque/auto). */
  background?: ImageBackground;
  /**
   * How strongly to match attached reference images. Maps to OpenAI
   * `input_fidelity` on the edits endpoint; ignored when there are no
   * references.
   */
  inputFidelity?: InputFidelity;
}

export interface GenerateOutput {
  bytes: Buffer;
  providerMetadata?: unknown;
}

/** Reference image metadata as it was attached to a provider request. */
export interface ProviderRequestReference {
  name: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * A serializable snapshot of the exact request a provider sent (or attempted
 * to send). Binary reference payloads are described by metadata only — the
 * bytes themselves stay retrievable from object storage via the filename.
 */
export interface ProviderRequestSnapshot {
  url: string;
  method: "POST";
  fields: Record<string, string>;
  references: ProviderRequestReference[];
}

/**
 * Contract implemented by provider error classes so callers (the generation
 * orchestrator) can persist failures with full context.
 */
export interface ProviderRequestError {
  status: number;
  body: unknown;
  requestSnapshot?: ProviderRequestSnapshot;
}

export function isProviderRequestError(
  err: unknown,
): err is Error & ProviderRequestError {
  return (
    err instanceof Error &&
    typeof (err as Partial<ProviderRequestError>).status === "number" &&
    "body" in err
  );
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
