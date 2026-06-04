import type { GeneratedImageDTO } from "./image-generator";
import type { ImageGeneratorConfig } from "$lib/services/image-providers/config";
import type {
  ComposerPresetDTO,
  ComposerTemplateDTO,
  ComposerTemplateGroupsDTO,
  PresetCreateInput,
  PresetUpdateInput,
  TemplateCreateInput,
  TemplateUpdateInput,
} from "./composer-library";
import type { StructuredPromptSuggestion } from "./structured-prompt";

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
  outputFormat?: "png" | "jpg";
  negativePrompt?: string;
  quality?: "auto" | "low" | "medium" | "high";
  background?: "auto" | "opaque" | "transparent";
  matchReferences?: boolean;
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
  displayName: string | null;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BrandAssetPage {
  items: BrandAssetDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listBrandAssets(
  brandId: number,
  opts?: { search?: string; page?: number },
): Promise<BrandAssetPage> {
  const url = new URL("/api/brand-assets", window.location.origin);
  url.searchParams.set("brandId", String(brandId));
  if (opts?.search) url.searchParams.set("search", opts.search);
  if (opts?.page && opts.page > 1) {
    url.searchParams.set("page", String(opts.page));
  }
  const res = await fetch(url.toString());
  return jsonOrThrow<BrandAssetPage>(res);
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

export async function suggestStructuredPrompt(
  description: string,
  brandGuidelines?: string,
): Promise<StructuredPromptSuggestion> {
  const res = await fetch("/api/images/structured-prompt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description, brandGuidelines }),
  });
  return jsonOrThrow<StructuredPromptSuggestion>(res);
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

export async function createPreset(
  body: PresetCreateInput,
): Promise<ComposerPresetDTO> {
  const res = await fetch("/api/images/presets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const { item } = await jsonOrThrow<{ item: ComposerPresetDTO }>(res);
  return item;
}

export async function updatePreset(
  id: string,
  body: PresetUpdateInput,
): Promise<ComposerPresetDTO> {
  const res = await fetch(`/api/images/presets/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const { item } = await jsonOrThrow<{ item: ComposerPresetDTO }>(res);
  return item;
}

export async function deletePreset(id: string): Promise<void> {
  const res = await fetch(`/api/images/presets/${id}`, { method: "DELETE" });
  if (!res.ok) await jsonOrThrow<never>(res);
}

export async function refreshPresets(): Promise<ComposerPresetDTO[]> {
  const res = await fetch("/api/images/presets");
  const { items } = await jsonOrThrow<{ items: ComposerPresetDTO[] }>(res);
  return items;
}

export async function createTemplate(
  body: TemplateCreateInput,
): Promise<ComposerTemplateDTO> {
  const res = await fetch("/api/images/templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const { item } = await jsonOrThrow<{ item: ComposerTemplateDTO }>(res);
  return item;
}

export async function updateTemplate(
  id: string,
  body: TemplateUpdateInput,
): Promise<ComposerTemplateDTO> {
  const res = await fetch(`/api/images/templates/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const { item } = await jsonOrThrow<{ item: ComposerTemplateDTO }>(res);
  return item;
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`/api/images/templates/${id}`, { method: "DELETE" });
  if (!res.ok) await jsonOrThrow<never>(res);
}

export async function refreshTemplates(): Promise<ComposerTemplateGroupsDTO> {
  const res = await fetch("/api/images/templates");
  return jsonOrThrow<ComposerTemplateGroupsDTO>(res);
}
