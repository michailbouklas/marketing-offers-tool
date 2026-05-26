import { prisma } from "$lib/server/prisma";
import {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  type GeneratedImageDTO,
  type GeneratedImageStatus,
  type ListGeneratedImagesQuery,
} from "./image-generator";

function toDTO(row: {
  id: string;
  prompt: string;
  finalPrompt: string;
  provider: string;
  model: string | null;
  requestedWidth: number;
  requestedHeight: number;
  generationWidth: number;
  generationHeight: number;
  style: string | null;
  camera: string | null;
  aspectRatio: string | null;
  referenceIds: unknown;
  status: string;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: Date;
}): GeneratedImageDTO {
  const referenceIds = Array.isArray(row.referenceIds)
    ? row.referenceIds.filter((v): v is string => typeof v === "string")
    : [];

  return {
    id: row.id,
    prompt: row.prompt,
    finalPrompt: row.finalPrompt,
    provider: row.provider,
    model: row.model,
    requestedWidth: row.requestedWidth,
    requestedHeight: row.requestedHeight,
    generationWidth: row.generationWidth,
    generationHeight: row.generationHeight,
    style: row.style,
    camera: row.camera,
    aspectRatio: row.aspectRatio,
    referenceIds,
    status: row.status as GeneratedImageStatus,
    errorMessage: row.errorMessage,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  };
}

function clampLimit(raw: number | undefined): number {
  if (!Number.isFinite(raw) || (raw as number) <= 0) {
    return DEFAULT_LIST_LIMIT;
  }
  return Math.min(Math.floor(raw as number), MAX_LIST_LIMIT);
}

function parseSince(raw: string | undefined): Date | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function listGeneratedImagesForUser(
  userId: string,
  query: ListGeneratedImagesQuery = {},
): Promise<GeneratedImageDTO[]> {
  const limit = clampLimit(query.limit ?? DEFAULT_LIST_LIMIT);
  const since = parseSince(query.since);

  const rows = await prisma.generatedImage.findMany({
    where: {
      userId,
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map(toDTO);
}
