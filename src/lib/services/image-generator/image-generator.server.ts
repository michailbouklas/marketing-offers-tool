import { prisma } from "$lib/server/prisma";
import type { Prisma } from "../../../generated/prisma/client";
import {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  type GeneratedImageDTO,
  type GeneratedImageStatus,
  type ListGeneratedImagesQuery,
} from "./image-generator";

const DEFAULT_HISTORY_PAGE_SIZE = 25;
const MAX_HISTORY_PAGE_SIZE = 100;
const DEFAULT_MODEL_FILTER_VALUE = "__default__";

export interface GeneratedImagesHistoryFilters {
  date?: string;
  model?: string;
  provider?: string;
  brandIds?: number[];
  includeNoBrand?: boolean;
  page?: number;
  pageSize?: number;
}

export interface GeneratedImagesHistoryPage {
  items: GeneratedImageDTO[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface GeneratedImageFilterOption {
  value: string;
  label: string;
}

export interface GeneratedImagesPromptGroup {
  prompt: string;
  items: GeneratedImageDTO[];
  latestCreatedAt: string;
}

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

export async function listAllGeneratedImagesForUser(
  userId: string,
): Promise<GeneratedImageDTO[]> {
  const rows = await prisma.generatedImage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return rows.map(toDTO);
}

function clampPage(raw: number | undefined): number {
  if (!Number.isFinite(raw) || (raw as number) <= 0) {
    return 1;
  }

  return Math.floor(raw as number);
}

function clampPageSize(raw: number | undefined): number {
  if (!Number.isFinite(raw) || (raw as number) <= 0) {
    return DEFAULT_HISTORY_PAGE_SIZE;
  }

  return Math.min(Math.floor(raw as number), MAX_HISTORY_PAGE_SIZE);
}

function getDateRange(date: string | undefined) {
  if (!date) {
    return undefined;
  }

  const start = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    return undefined;
  }

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return { gte: start, lt: end };
}

function buildHistoryWhere(
  userId: string,
  filters: GeneratedImagesHistoryFilters,
): Prisma.GeneratedImageWhereInput {
  const dateRange = getDateRange(filters.date);
  const brandIds = filters.brandIds ?? [];
  const brandConditions: Prisma.GeneratedImageWhereInput[] = [];

  if (brandIds.length > 0) {
    brandConditions.push({ brandId: { in: brandIds } });
  }

  if (filters.includeNoBrand) {
    brandConditions.push({ brandId: null });
  }

  return {
    userId,
    ...(dateRange ? { createdAt: dateRange } : {}),
    ...(filters.provider ? { provider: filters.provider } : {}),
    ...(filters.model
      ? {
          model:
            filters.model === DEFAULT_MODEL_FILTER_VALUE ? null : filters.model,
        }
      : {}),
    ...(brandConditions.length > 0 ? { OR: brandConditions } : {}),
  };
}

export async function listGeneratedImagesHistoryForUser(
  userId: string,
  filters: GeneratedImagesHistoryFilters = {},
): Promise<GeneratedImagesHistoryPage> {
  const pageSize = clampPageSize(filters.pageSize);
  const requestedPage = clampPage(filters.page);
  const where = buildHistoryWhere(userId, filters);
  const totalItems = await prisma.generatedImage.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);

  const rows = await prisma.generatedImage.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    items: rows.map(toDTO),
    page,
    pageSize,
    totalItems,
    totalPages,
  };
}

export async function listGeneratedImagePromptGroupsForUser(
  userId: string,
  filters: GeneratedImagesHistoryFilters = {},
): Promise<GeneratedImagesPromptGroup[]> {
  const rows = await prisma.generatedImage.findMany({
    where: buildHistoryWhere(userId, filters),
    orderBy: { createdAt: "desc" },
  });

  const groups = new Map<string, GeneratedImageDTO[]>();
  for (const row of rows.map(toDTO)) {
    groups.set(row.prompt, [...(groups.get(row.prompt) ?? []), row]);
  }

  return Array.from(groups.entries()).map(([prompt, items]) => ({
    prompt,
    items,
    latestCreatedAt: items[0]?.createdAt ?? "",
  }));
}

export async function listGeneratedImageFilterOptionsForUser(userId: string) {
  const [models, providers] = await Promise.all([
    prisma.generatedImage.findMany({
      where: { userId },
      distinct: ["model"],
      select: { model: true },
      orderBy: { model: "asc" },
    }),
    prisma.generatedImage.findMany({
      where: { userId },
      distinct: ["provider"],
      select: { provider: true },
      orderBy: { provider: "asc" },
    }),
  ]);

  return {
    models: models.map<GeneratedImageFilterOption>((row) => ({
      value: row.model ?? DEFAULT_MODEL_FILTER_VALUE,
      label: row.model ?? "Default model",
    })),
    providers: providers.map<GeneratedImageFilterOption>((row) => ({
      value: row.provider,
      label: row.provider,
    })),
  };
}
