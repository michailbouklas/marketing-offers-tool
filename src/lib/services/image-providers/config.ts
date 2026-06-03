export type ImageProviderId = "imagerouter" | "openai";

/**
 * Capabilities for a single model, derived from the provider (ImageRouter's
 * `/v2/models` endpoint, or a static map for OpenAI). `sizes` holds concrete
 * `"WxH"` strings and may also include the sentinels `"auto"` / `"custom"`.
 */
export interface ImageModelConfig {
  id: string;
  sizes: string[];
  supportsQuality: boolean;
  supportsReferences: boolean;
  supportsMask: boolean;
}

export interface ImageProviderConfig {
  id: ImageProviderId;
  models: ImageModelConfig[];
}

export interface ImageGeneratorConfig {
  providers: ImageProviderConfig[];
  defaultProvider: ImageProviderId | null;
  defaultModel: string | null;
  samplesPerModelMax: number;
}

/** Fallback sizes used when a model's real capabilities can't be determined. */
export const SUPPORTED_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
