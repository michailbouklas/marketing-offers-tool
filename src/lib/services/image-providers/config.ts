export type ImageProviderId = "imagerouter" | "openai";

export interface ImageProviderConfig {
  id: ImageProviderId;
  models: string[];
  sizes: string[];
}

export interface ImageGeneratorConfig {
  providers: ImageProviderConfig[];
  defaultProvider: ImageProviderId | null;
  defaultModel: string | null;
  samplesPerModelMax: number;
}

export const SUPPORTED_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
