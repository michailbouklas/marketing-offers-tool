import type { ImageProviderId } from "$lib/services/image-providers/config";

export const STYLES = [
  "none",
  "photorealistic",
  "illustration",
  "cartoon",
  "cinematic",
] as const;

export const CAMERAS = [
  "none",
  "close-up top-down shot",
  "35mm perspective",
  "macro shot",
] as const;

export const OUTPUT_FORMATS = ["png", "jpg"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const QUALITY_OPTIONS = [
  { value: "auto", label: "auto" },
  { value: "low", label: "low (fastest)" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high (best)" },
] as const;
export type Quality = (typeof QUALITY_OPTIONS)[number]["value"];

export const BACKGROUND_OPTIONS = [
  { value: "auto", label: "auto" },
  { value: "opaque", label: "opaque" },
  { value: "transparent", label: "transparent" },
] as const;
export type Background = (typeof BACKGROUND_OPTIONS)[number]["value"];

export type Style = (typeof STYLES)[number];
export type Camera = (typeof CAMERAS)[number];

export interface ComposerState {
  prompt: string;
  provider: ImageProviderId;
  models: string[];
  /** Chosen resolution: a concrete "WxH" or "auto". Aspect ratio is derived. */
  size: string;
  style: Style;
  camera: Camera;
  outputFormat: OutputFormat;
  negativePrompt: string;
  quality: Quality;
  background: Background;
  matchReferences: boolean;
  enhance: boolean;
  samplesPerModel: number;
  referenceIds: string[];
  brandId?: number | null;
}

export interface SubmitPayload extends ComposerState {
  referenceFiles: File[];
  brandGuidelines?: string;
}
