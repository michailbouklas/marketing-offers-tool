import type { GeneratedImageDTO } from "./image-generator";
import type { ImageGeneratorConfig } from "$lib/services/image-providers/config";

export interface ReferenceUploadResult {
  id: string;
  contentType: string;
}

export interface ClarifyingQuestion {
  question: string;
  example?: string;
}

export interface ClarificationAnswer {
  question: string;
  answer: string;
}

export interface EnhanceResult {
  critique?: string;
  clarifyingQuestions?: ClarifyingQuestion[];
  enhancedPrompt?: string;
}

export interface GenerateClientBody {
  prompt: string;
  provider: ImageGeneratorConfig["providers"][number]["id"];
  model?: string;
  models?: string[];
  size?: string;
  style?: string;
  camera?: string;
  aspectRatio?: "square" | "widescreen" | "tiktok";
  outputFormat?: "png" | "jpg";
  references?: string[];
  brandId?: number;
  brandGuidelines?: string;
  allModels?: boolean;
  samplesPerModel?: number;
}

export interface BrandAssetDTO {
  id: string;
  brandId: number;
  name: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export async function listBrandAssets(
  brandId: number,
): Promise<BrandAssetDTO[]> {
  const url = new URL("/api/brand-assets", window.location.origin);
  url.searchParams.set("brandId", String(brandId));
  const res = await fetch(url.toString());
  const { items } = await jsonOrThrow<{ items: BrandAssetDTO[] }>(res);
  return items;
}

export async function attachBrandAssetAsReference(
  assetId: string,
): Promise<ReferenceUploadResult> {
  const res = await fetch("/api/images/references/from-brand-asset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assetId }),
  });
  return jsonOrThrow<ReferenceUploadResult>(res);
}

export async function fetchBrandGuidelines(brandId: number): Promise<string> {
  const url = new URL("/api/brand-guidelines", window.location.origin);
  url.searchParams.set("brandId", String(brandId));
  const res = await fetch(url.toString());
  const { markdown } = await jsonOrThrow<{ markdown: string }>(res);
  return markdown;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function uploadReferences(
  files: File[],
): Promise<ReferenceUploadResult[]> {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  const res = await fetch("/api/images/references", {
    method: "POST",
    body: form,
  });
  return jsonOrThrow<ReferenceUploadResult[]>(res);
}

export async function enhancePrompt(
  prompt: string,
  brandGuidelines?: string,
  referenceIds?: string[],
  clarifications?: ClarificationAnswer[],
): Promise<EnhanceResult> {
  const res = await fetch("/api/images/enhance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt,
      brandGuidelines,
      referenceIds,
      clarifications:
        clarifications && clarifications.length > 0
          ? clarifications
          : undefined,
    }),
  });
  return jsonOrThrow<EnhanceResult>(res);
}

export async function submitGeneration(
  body: GenerateClientBody,
): Promise<{ items: GeneratedImageDTO[] }> {
  const res = await fetch("/api/images/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow<{ items: GeneratedImageDTO[] }>(res);
}

export async function fetchImagesSince(
  since: string | null,
): Promise<{ items: GeneratedImageDTO[] }> {
  const url = new URL("/api/images", window.location.origin);
  if (since) url.searchParams.set("since", since);
  url.searchParams.set("limit", "50");
  const res = await fetch(url.toString());
  return jsonOrThrow<{ items: GeneratedImageDTO[] }>(res);
}
