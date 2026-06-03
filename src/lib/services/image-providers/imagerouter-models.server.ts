export interface ImageRouterModelCaps {
  sizes: string[];
  quality: boolean;
  image: boolean;
  mask: boolean;
  output: string[];
}

interface RawModel {
  id?: unknown;
  output?: unknown;
  inputs?: {
    image?: unknown;
    mask?: unknown;
    quality?: unknown;
    size?: unknown;
  };
}

interface CacheEntry {
  at: number;
  caps: Map<string, ImageRouterModelCaps>;
}

const TTL_MS = 60 * 60 * 1000; // 1h — model capabilities change rarely.
let cache: CacheEntry | null = null;

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/** Normalises the `/v2/models` payload, which may be an array, a `{data:[]}`
 * envelope, or an object keyed by model id. */
function toModelList(json: unknown): RawModel[] {
  if (Array.isArray(json)) {
    return json as RawModel[];
  }
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.data)) {
      return obj.data as RawModel[];
    }
    return Object.entries(obj).map(([id, value]) => {
      const model = (value ?? {}) as RawModel;
      return { ...model, id: typeof model.id === "string" ? model.id : id };
    });
  }
  return [];
}

/**
 * Fetches per-model capabilities from ImageRouter's `GET /v2/models` endpoint
 * (no auth required) and caches them in memory for {@link TTL_MS}. On any
 * failure it returns an empty map so callers fall back to default sizes.
 */
export async function fetchImageRouterModelCaps(
  baseUrl: string,
  options: { fetch?: typeof fetch; now?: number } = {},
): Promise<Map<string, ImageRouterModelCaps>> {
  const now = options.now ?? Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return cache.caps;
  }

  const fetchFn = options.fetch ?? fetch;
  const url = `${baseUrl.replace(/\/+$/, "")}/v2/models`;
  const caps = new Map<string, ImageRouterModelCaps>();

  try {
    const res = await fetchFn(url);
    if (res.ok) {
      const json = (await res.json()) as unknown;
      for (const model of toModelList(json)) {
        if (typeof model.id !== "string") {
          continue;
        }
        const inputs = model.inputs ?? {};
        caps.set(model.id, {
          sizes: stringArray(inputs.size),
          quality: inputs.quality === true,
          image: inputs.image === true,
          mask: inputs.mask === true,
          output: stringArray(model.output),
        });
      }
    }
  } catch {
    // Network/parse failure: leave caps empty so callers use fallback sizes.
  }

  cache = { at: now, caps };
  return caps;
}

/** Test helper — resets the in-memory cache. */
export function __clearImageRouterModelCapsCache(): void {
  cache = null;
}
