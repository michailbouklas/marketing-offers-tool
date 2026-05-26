import type { GeneratedImageDTO } from "./image-generator";
import type { ImageGeneratorConfig } from "$lib/services/image-providers/config";

export interface ReferenceUploadResult {
  id: string;
  contentType: string;
}

export interface EnhanceResult {
  clarifyingQuestions?: string[];
  enhancedPrompt?: string;
}

export interface GenerateClientBody {
  prompt: string;
  provider: ImageGeneratorConfig["providers"][number]["id"];
  model?: string;
  size?: string;
  style?: string;
  camera?: string;
  aspectRatio?: "square" | "widescreen" | "tiktok";
  references?: string[];
  allModels?: boolean;
  samplesPerModel?: number;
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

export async function enhancePrompt(prompt: string): Promise<EnhanceResult> {
  const res = await fetch("/api/images/enhance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
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
