import { z } from "zod";

/**
 * Shared, browser-safe contract for the image compliance checker:
 * limits, workflow step ids/labels, the verdict schemas and the NDJSON
 * progress events streamed from /api/image-compliance/check. Imported by
 * the Mastra workflow (relative path), the API route and the page.
 */

export const ALLOWED_IMAGE_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

export function isAllowedImageMime(value: string): value is AllowedImageMime {
  return (ALLOWED_IMAGE_MIME as readonly string[]).includes(value);
}

/** Per-file upload cap. Prod outside docker-compose must set BODY_SIZE_LIMIT ≥ this. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Max images in one batch on the page. */
export const MAX_FILES = 12;
/** Max concurrent checks the browser keeps in flight. */
export const MAX_IN_FLIGHT = 4;
/** Same cap as the admin guidelines / compliance-rules editors. */
export const MAX_RULES_CHARS = 50_000;
/** Reasons / suggestions kept per verdict after normalisation. */
export const MAX_FINDINGS = 12;

export const COMPLIANCE_STEP_IDS = [
  "prepare-image",
  "analyze-compliance",
] as const;
export type ComplianceStepId = (typeof COMPLIANCE_STEP_IDS)[number];

export const COMPLIANCE_STEP_LABELS: Record<ComplianceStepId, string> = {
  "prepare-image": "Preparing image",
  "analyze-compliance": "Checking against compliance rules",
};

export function isComplianceStepId(value: unknown): value is ComplianceStepId {
  return (
    typeof value === "string" &&
    (COMPLIANCE_STEP_IDS as readonly string[]).includes(value)
  );
}

/**
 * Shape requested from the model. Every field is required so the schema is
 * valid for OpenAI's strict JSON mode; `normalizeComplianceVerdict` is the
 * lenient reader that tolerates nulls/omissions.
 */
export const complianceVerdictSchema = z.object({
  compliant: z
    .boolean()
    .describe("true only when the image violates none of the rules"),
  summary: z.string().describe("One or two sentences summarising the verdict"),
  reasons: z
    .array(z.string())
    .describe(
      "Each violation: the guideline broken and the concrete visual evidence. Empty when compliant.",
    ),
  suggestions: z
    .array(z.string())
    .describe("Specific, actionable changes that would fix the violations"),
});
export type ComplianceVerdict = z.infer<typeof complianceVerdictSchema>;

const lenientVerdictSchema = z.object({
  compliant: z.boolean(),
  summary: z.string().nullish(),
  reasons: z.array(z.string().nullish()).nullish(),
  suggestions: z.array(z.string().nullish()).nullish(),
});

export const complianceResultSchema = z.object({
  compliant: z.boolean(),
  summary: z.string(),
  reasons: z.array(z.string()),
  suggestions: z.array(z.string()),
  image: z.object({
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
  }),
});
export type ComplianceResult = z.infer<typeof complianceResultSchema>;

function cleanList(
  items: ReadonlyArray<string | null | undefined> | null | undefined,
  limit: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items ?? []) {
    const text = (item ?? "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Turns whatever the model returned into a UI-ready result. Throws when the
 * payload is not a verdict at all (so the workflow step fails and retries).
 * Invariant: `compliant` is never true while `reasons` is non-empty; a
 * `compliant: false` with no reasons stays false (the model's call stands).
 */
export function normalizeComplianceVerdict(
  raw: unknown,
  image: { width: number; height: number },
  limit: number = MAX_FINDINGS,
): ComplianceResult {
  const parsed = lenientVerdictSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("The model returned an unexpected verdict shape");
  }
  const verdict = parsed.data;
  const reasons = cleanList(verdict.reasons, limit);
  const suggestions = cleanList(verdict.suggestions, limit);
  return {
    compliant: verdict.compliant && reasons.length === 0,
    summary: (verdict.summary ?? "").trim(),
    reasons,
    suggestions,
    image: { width: image.width, height: image.height },
  };
}

export type ComplianceStreamEvent =
  | { type: "step-start"; step: ComplianceStepId }
  | {
      type: "step-result";
      step: ComplianceStepId;
      status: "success" | "failed";
    }
  | { type: "done"; result: ComplianceResult; durationMs: number }
  | { type: "error"; message: string };

/** Splits buffered NDJSON into complete lines; `rest` is the unterminated tail. */
export function splitNdjson(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  const lines = parts.map((line) => line.replace(/\r$/, "")).filter(Boolean);
  return { lines, rest };
}

/** Parses one NDJSON line; returns null for malformed or unknown events. */
export function parseComplianceStreamEvent(
  line: string,
): ComplianceStreamEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || !("type" in value)) {
    return null;
  }
  const event = value as Record<string, unknown>;
  switch (event.type) {
    case "step-start":
      return isComplianceStepId(event.step)
        ? { type: "step-start", step: event.step }
        : null;
    case "step-result":
      return isComplianceStepId(event.step)
        ? {
            type: "step-result",
            step: event.step,
            status: event.status === "success" ? "success" : "failed",
          }
        : null;
    case "done": {
      const result = complianceResultSchema.safeParse(event.result);
      return result.success
        ? {
            type: "done",
            result: result.data,
            durationMs:
              typeof event.durationMs === "number" ? event.durationMs : 0,
          }
        : null;
    }
    case "error":
      return {
        type: "error",
        message:
          typeof event.message === "string" && event.message
            ? event.message
            : "The check failed",
      };
    default:
      return null;
  }
}

export function formatElapsed(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

/** Stable identity for "the same file picked twice". */
export function fileDedupeKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export interface ComplianceMarkdownInput {
  fileName: string;
  brandName?: string | null;
  result: ComplianceResult;
  durationMs?: number | null;
}

/** Markdown report for one image, suitable for pasting into chat/tickets. */
export function formatComplianceMarkdown(
  input: ComplianceMarkdownInput,
): string {
  const { fileName, brandName, result, durationMs } = input;
  const lines: string[] = [`# Compliance check: ${fileName}`, ""];
  if (brandName) lines.push(`- **Brand:** ${brandName}`);
  lines.push(
    `- **Verdict:** ${result.compliant ? "Compliant" : "Not compliant"}`,
  );
  if (typeof durationMs === "number" && durationMs > 0) {
    lines.push(`- **Checked in:** ${formatElapsed(durationMs)}`);
  }
  if (result.summary) {
    lines.push("", "## Summary", "", result.summary);
  }
  if (result.reasons.length > 0) {
    lines.push("", "## Findings", "", ...result.reasons.map((r) => `- ${r}`));
  }
  if (result.suggestions.length > 0) {
    lines.push(
      "",
      "## Suggestions",
      "",
      ...result.suggestions.map((s) => `- ${s}`),
    );
  }
  return lines.join("\n") + "\n";
}
