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

export const ASPECT_RATIOS = [
  { value: "none", label: "(no override)" },
  { value: "square", label: "square (1024×1024)" },
  { value: "widescreen", label: "widescreen (1536×1024)" },
  { value: "tiktok", label: "tiktok (1024×1536)" },
] as const;

export const OUTPUT_FORMATS = ["png", "jpg"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export type Style = (typeof STYLES)[number];
export type Camera = (typeof CAMERAS)[number];
export type AspectRatio = "none" | "square" | "widescreen" | "tiktok";

export interface ComposerState {
  prompt: string;
  provider: ImageProviderId;
  models: string[];
  size: string;
  style: Style;
  camera: Camera;
  aspectRatio: AspectRatio;
  outputFormat: OutputFormat;
  enhance: boolean;
  samplesPerModel: number;
  referenceIds: string[];
  brandId?: number | null;
}

export interface SubmitPayload extends ComposerState {
  referenceFiles: File[];
  brandGuidelines?: string;
}
