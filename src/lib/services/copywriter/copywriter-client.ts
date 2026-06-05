import type { GeneratedCopyDTO } from "./copywriter";
import type { CopyType } from "./types";

export { fetchBrandGuidelines } from "$lib/services/image-generator/image-generator-client";

export interface GenerateCopyClientBody {
  copyType: CopyType;
  channel: string;
  brief: string;
  tone?: string;
  variantCount?: number;
  provider: "openai";
  model?: string;
  brandId?: number;
  brandGuidelines?: string;
  offerId?: number;
}

export interface GeneratedCopyPage {
  items: GeneratedCopyDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export async function submitCopyGeneration(
  body: GenerateCopyClientBody,
): Promise<{ item: GeneratedCopyDTO }> {
  const res = await fetch("/api/copy/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow<{ item: GeneratedCopyDTO }>(res);
}

export async function fetchCopyHistory(opts?: {
  page?: number;
  limit?: number;
}): Promise<GeneratedCopyPage> {
  const url = new URL("/api/copy", window.location.origin);
  if (opts?.page && opts.page > 1)
    url.searchParams.set("page", String(opts.page));
  if (opts?.limit) url.searchParams.set("limit", String(opts.limit));
  const res = await fetch(url.toString());
  return jsonOrThrow<GeneratedCopyPage>(res);
}

export async function rateVariant(
  generatedCopyId: string,
  variantIndex: number,
  feedback: { rating?: number | null; picked?: boolean },
): Promise<{ item: GeneratedCopyDTO }> {
  const res = await fetch(`/api/copy/${generatedCopyId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ variantIndex, ...feedback }),
  });
  return jsonOrThrow<{ item: GeneratedCopyDTO }>(res);
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}
