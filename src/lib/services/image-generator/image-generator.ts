export type GeneratedImageStatus = "pending" | "completed" | "failed";

export interface GeneratedImageDTO {
  id: string;
  prompt: string;
  finalPrompt: string;
  provider: string;
  model: string | null;
  requestedWidth: number;
  requestedHeight: number;
  generationWidth: number;
  generationHeight: number;
  style: string | null;
  camera: string | null;
  aspectRatio: string | null;
  negativePrompt: string | null;
  quality: string | null;
  background: string | null;
  inputFidelity: string | null;
  referenceIds: string[];
  status: GeneratedImageStatus;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface ListGeneratedImagesQuery {
  since?: string;
  limit?: number;
}

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;

// Query-param sentinel used by the brand filter to match generations that
// are not associated with any brand (GeneratedImage.brandId is null).
export const BRAND_NONE_KEY = "none";
