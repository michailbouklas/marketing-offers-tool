import sharp from "sharp";

export interface ImageDimensions {
  width: number;
  height: number;
}

export const DEFAULT_DIMENSION = 1024;

export const PROVIDER_SUPPORTED_SIZES: ReadonlyArray<ImageDimensions> = [
  { width: 1024, height: 1024 },
  { width: 1536, height: 1024 },
  { width: 1024, height: 1536 },
];

function toPositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

export function parseRequestedSize(input: string | undefined): ImageDimensions {
  const fallback: ImageDimensions = {
    width: DEFAULT_DIMENSION,
    height: DEFAULT_DIMENSION,
  };

  if (input === undefined) {
    return fallback;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return fallback;
  }

  const match = /^([^xX]*)[xX]([^xX]*)$/.exec(trimmed);
  if (!match) {
    return fallback;
  }

  const width = toPositiveInt(match[1]?.trim()) ?? DEFAULT_DIMENSION;
  const height = toPositiveInt(match[2]?.trim()) ?? DEFAULT_DIMENSION;

  return { width, height };
}

function squaredAspectRatioDelta(
  a: ImageDimensions,
  b: ImageDimensions,
): number {
  const aRatio = a.width / a.height;
  const bRatio = b.width / b.height;
  return (aRatio - bRatio) ** 2;
}

export function mapToNearestSupportedSize(
  requested: ImageDimensions,
  candidates: ReadonlyArray<ImageDimensions> = PROVIDER_SUPPORTED_SIZES,
): ImageDimensions {
  const pool = candidates.length > 0 ? candidates : PROVIDER_SUPPORTED_SIZES;

  // Exact match wins outright (the requested size is natively supported).
  const exact = pool.find(
    (c) => c.width === requested.width && c.height === requested.height,
  );
  if (exact) {
    return exact;
  }

  let best: ImageDimensions = pool[0]!;
  let bestDelta = squaredAspectRatioDelta(requested, best);

  for (const candidate of pool.slice(1)) {
    const delta = squaredAspectRatioDelta(requested, candidate);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }

  return best;
}

export async function resizeToRequested(
  bytes: Buffer,
  requested: ImageDimensions & { format?: "png" | "jpg" },
): Promise<Buffer> {
  const meta = await sharp(bytes).metadata();
  const needsResize =
    meta.width !== requested.width || meta.height !== requested.height;
  const format = requested.format ?? "png";

  let pipeline = sharp(bytes);
  if (needsResize) {
    pipeline = pipeline.resize(requested.width, requested.height, {
      fit: "cover",
    });
  }

  if (format === "jpg") {
    return pipeline.jpeg({ quality: 90 }).toBuffer();
  }
  return pipeline.png().toBuffer();
}
