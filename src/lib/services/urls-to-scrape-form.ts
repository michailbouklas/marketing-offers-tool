import { z } from "zod";
import { Aggregator } from "$lib/services/aggregator-offers";
import { aggregatorOptions } from "$lib/services/offer-editor-form";

export { aggregatorOptions };

const urlField = z
  .string()
  .trim()
  .min(1, "URL is required")
  .url("Must be a valid URL");

const aggregatorField = z
  .string()
  .trim()
  .default("")
  .refine(
    (value): value is Aggregator =>
      aggregatorOptions.includes(value as Aggregator),
    "Aggregator is required",
  );

export const urlToScrapeFormSchema = z.object({
  url: urlField,
  aggregator: aggregatorField,
});

/** Payload validated by the bulk-add server action. */
export const bulkUrlToScrapeSchema = z
  .array(
    z.object({
      url: urlField,
      aggregator: aggregatorField,
    }),
  )
  .min(1, "At least one URL is required");

export type BulkUrlToScrapeItem = {
  url: string;
  aggregator: "" | Aggregator;
};

export type UrlToScrapeFormData = z.infer<typeof urlToScrapeFormSchema>;

export type UrlToScrapeFormDefaults = Omit<
  UrlToScrapeFormData,
  "aggregator"
> & {
  aggregator: "" | Aggregator;
};

export type UrlToScrapeActionMessage = {
  text: string;
};

export function getDefaultUrlToScrapeFormData(): UrlToScrapeFormDefaults {
  return {
    url: "",
    aggregator: "",
  };
}

/** Capitalize an aggregator enum value for display (e.g. `foody` -> `Foody`). */
export function aggregatorLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Guess the aggregator from a URL by matching known brand tokens in the host.
 * Returns `""` when nothing matches so the user is forced to pick in the
 * preview. (Only `foody` samples were provided; the other patterns are
 * best-effort and can be tweaked.)
 */
const AGGREGATOR_URL_PATTERNS: { aggregator: Aggregator; pattern: RegExp }[] = [
  { aggregator: Aggregator.foody, pattern: /foody\./i },
  { aggregator: Aggregator.wolt, pattern: /wolt\./i },
  {
    aggregator: Aggregator.bolt,
    pattern: /bolt\.(eu|food)|food\.bolt\.|bolt\./i,
  },
  { aggregator: Aggregator.efood, pattern: /e-?food\./i },
];

export function detectAggregator(url: string): Aggregator | "" {
  for (const { aggregator, pattern } of AGGREGATOR_URL_PATTERNS) {
    if (pattern.test(url)) {
      return aggregator;
    }
  }
  return "";
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Parse bulk input that is either a JSON array of URL strings or a
 * newline-separated list. Trims each entry, drops blanks/invalid URLs, and
 * dedupes exact duplicates. Returns the kept URLs plus how many entries were
 * skipped (invalid or duplicate).
 */
export function parseBulkUrlInput(text: string): {
  urls: string[];
  skipped: number;
} {
  const trimmed = text.trim();

  let candidates: string[] = [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        candidates = parsed.map((entry) => String(entry));
      }
    } catch {
      candidates = [];
    }
  }

  if (candidates.length === 0) {
    candidates = trimmed.split(/\r?\n/);
  }

  const seen = new Set<string>();
  const urls: string[] = [];
  let skipped = 0;

  for (const entry of candidates) {
    const url = entry.trim();
    if (!url) {
      continue;
    }
    if (!isValidHttpUrl(url) || seen.has(url)) {
      skipped += 1;
      continue;
    }
    seen.add(url);
    urls.push(url);
  }

  return { urls, skipped };
}
