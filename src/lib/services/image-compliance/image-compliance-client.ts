import {
  parseComplianceStreamEvent,
  splitNdjson,
  type ComplianceResult,
  type ComplianceStreamEvent,
} from "./image-compliance";

export interface CheckImageOptions {
  brandId: number;
  rules: string;
}

export interface CheckImageHandlers {
  onEvent?: (event: ComplianceStreamEvent) => void;
  signal?: AbortSignal;
}

/**
 * Uploads one image and consumes the NDJSON progress stream from
 * POST /api/image-compliance/check. Resolves with the final verdict; throws
 * on HTTP errors, an `error` event, or a stream that ends without `done`.
 */
export async function checkImageCompliance(
  file: File,
  options: CheckImageOptions,
  handlers: CheckImageHandlers = {},
): Promise<ComplianceResult> {
  const form = new FormData();
  form.set("file", file, file.name);
  form.set("brandId", String(options.brandId));
  form.set("rules", options.rules);

  const res = await fetch("/api/image-compliance/check", {
    method: "POST",
    body: form,
    headers: { accept: "application/json" },
    signal: handlers.signal,
  });

  if (!res.ok) {
    throw new Error(await errorMessage(res));
  }
  if (!res.body) {
    throw new Error("The server returned an empty response");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ComplianceResult | null = null;

  const handleLine = (line: string) => {
    const event = parseComplianceStreamEvent(line);
    if (!event) return;
    handlers.onEvent?.(event);
    if (event.type === "done") {
      result = event.result;
    } else if (event.type === "error") {
      throw new Error(event.message);
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { lines, rest } = splitNdjson(buffer);
    buffer = rest;
    for (const line of lines) handleLine(line);
  }
  buffer += decoder.decode();
  if (buffer.trim()) handleLine(buffer);

  if (!result) {
    throw new Error("The check ended without a verdict");
  }
  return result;
}

async function errorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  if (text) {
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message) {
        return parsed.message;
      }
    } catch {
      // Not JSON — fall through to the raw text.
    }
    return text;
  }
  return `Request failed: ${res.status} ${res.statusText}`;
}

/** Admin-maintained compliance rules for an assigned brand ("" when none saved). */
export async function fetchBrandComplianceRules(
  brandId: number,
): Promise<string> {
  const url = new URL("/api/brand-compliance-rules", window.location.origin);
  url.searchParams.set("brandId", String(brandId));
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(await errorMessage(res));
  }
  const { markdown } = (await res.json()) as { markdown?: string };
  return markdown ?? "";
}
