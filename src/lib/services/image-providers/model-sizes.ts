import type { ImageModelConfig } from "./config";

/** Model picks the resolution itself. */
export const AUTO_SIZE = "auto";
/** Model accepts arbitrary `WxH` resolutions. */
export const CUSTOM_SIZE = "custom";

export interface ParsedSize {
  width: number;
  height: number;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/** Parses a concrete `"WxH"` size; returns null for `auto`/`custom`/garbage. */
export function parseSize(size: string): ParsedSize | null {
  const match = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(size.trim());
  if (!match) {
    return null;
  }
  const width = Number.parseInt(match[1]!, 10);
  const height = Number.parseInt(match[2]!, 10);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { width, height };
}

/** Reduced aspect ratio of a concrete size, e.g. `"16:9"`. Null otherwise. */
export function ratioOf(size: string): string | null {
  const dims = parseSize(size);
  if (!dims) {
    return null;
  }
  const divisor = greatestCommonDivisor(dims.width, dims.height) || 1;
  return `${dims.width / divisor}:${dims.height / divisor}`;
}

/** Human-readable picker label, e.g. `"1024×576 · 16:9"`. */
export function sizeLabel(size: string): string {
  if (size === AUTO_SIZE) {
    return "Auto (model default)";
  }
  if (size === CUSTOM_SIZE) {
    return "Custom size";
  }
  const dims = parseSize(size);
  const ratio = ratioOf(size);
  if (!dims || !ratio) {
    return size;
  }
  return `${dims.width}×${dims.height} · ${ratio}`;
}

function concreteSizes(model: ImageModelConfig): string[] {
  return model.sizes.filter((s) => parseSize(s) !== null);
}

/**
 * Order-preserving list of sizes offered when the given models are selected
 * together:
 *
 * - Concrete sizes are the intersection across models that *have* concrete
 *   sizes. A pure-`custom` model (no concrete list) accepts anything, so it
 *   doesn't shrink that intersection.
 * - `"auto"` is appended when every model supports auto (or is custom).
 * - `"custom"` is appended when every model accepts arbitrary sizes.
 * - Returns `[]` only when there are no concrete overlaps and neither auto nor
 *   custom is universally available — callers should warn and fall back to auto.
 */
export function intersectModelSizes(models: ImageModelConfig[]): string[] {
  if (models.length === 0) {
    return [];
  }

  const withConcrete = models.filter((m) => concreteSizes(m).length > 0);
  let concrete: string[] = [];
  if (withConcrete.length > 0) {
    concrete = concreteSizes(withConcrete[0]!);
    for (const model of withConcrete.slice(1)) {
      const supported = new Set(model.sizes);
      concrete = concrete.filter((s) => supported.has(s));
    }
  }

  const everyModelSupportsAuto = models.every(
    (m) => m.sizes.includes(AUTO_SIZE) || m.sizes.includes(CUSTOM_SIZE),
  );
  const everyModelSupportsCustom = models.every((m) =>
    m.sizes.includes(CUSTOM_SIZE),
  );

  const out = [...concrete];
  if (everyModelSupportsAuto) {
    out.push(AUTO_SIZE);
  }
  if (everyModelSupportsCustom) {
    out.push(CUSTOM_SIZE);
  }
  return out;
}
