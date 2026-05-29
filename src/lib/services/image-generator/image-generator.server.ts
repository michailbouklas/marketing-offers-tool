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

export interface GeneratedImageUsagePoint {
  /** UTC day in `YYYY-MM-DD` format. */
  date: string;
  /** Number of images the user generated on that day. */
  count: number;
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

function toUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Buckets a set of generation timestamps into daily counts, ordered oldest to
 * newest. Missing days within the active range are filled with zero so the
 * area chart renders a continuous timeline rather than collapsing gaps between
 * sparse generations. Rows are assumed to be sorted ascending by `createdAt`.
 */
function bucketUsageByDay(
  rows: { createdAt: Date }[],
): GeneratedImageUsagePoint[] {
  if (rows.length === 0) {
    return [];
  }

  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = toUtcDayKey(row.createdAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const firstDay = new Date(`${toUtcDayKey(rows[0]!.createdAt)}T00:00:00.000Z`);
  const lastDay = new Date(
    `${toUtcDayKey(rows[rows.length - 1]!.createdAt)}T00:00:00.000Z`,
  );

  const points: GeneratedImageUsagePoint[] = [];
  for (
    const cursor = new Date(firstDay);
    cursor.getTime() <= lastDay.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const key = toUtcDayKey(cursor);
    points.push({ date: key, count: counts.get(key) ?? 0 });
  }

  return points;
}

/**
 * Daily count of images a single user generated, for the usage area chart.
 */
export async function getGeneratedImageUsageByDayForUser(
  userId: string,
): Promise<GeneratedImageUsagePoint[]> {
  const rows = await prisma.generatedImage.findMany({
    where: { userId },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return bucketUsageByDay(rows);
}

export interface UsageDateRange {
  /** Inclusive start day, `YYYY-MM-DD` (UTC). */
  from?: string;
  /** Inclusive end day, `YYYY-MM-DD` (UTC). */
  to?: string;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates raw `from`/`to` query values into a `UsageDateRange`, keeping only
 * well-formed `YYYY-MM-DD` days. Returns `undefined` when neither bound is
 * usable so callers can treat it as "all time".
 */
export function parseUsageDateRange(
  from: string | null | undefined,
  to: string | null | undefined,
): UsageDateRange | undefined {
  const validFrom = from && DAY_PATTERN.test(from) ? from : undefined;
  const validTo = to && DAY_PATTERN.test(to) ? to : undefined;

  if (!validFrom && !validTo) {
    return undefined;
  }

  return { from: validFrom, to: validTo };
}

/**
 * Translates an inclusive `YYYY-MM-DD` day range into a Prisma `createdAt`
 * filter. The `to` day is made inclusive by querying up to the start of the
 * following day. Returns an empty object when no usable bounds are given.
 */
function buildUsageWhere(
  range: UsageDateRange | undefined,
): Prisma.GeneratedImageWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};

  if (range?.from) {
    const start = new Date(`${range.from}T00:00:00.000Z`);
    if (!Number.isNaN(start.getTime())) {
      createdAt.gte = start;
    }
  }

  if (range?.to) {
    const end = new Date(`${range.to}T00:00:00.000Z`);
    if (!Number.isNaN(end.getTime())) {
      end.setUTCDate(end.getUTCDate() + 1);
      createdAt.lt = end;
    }
  }

  return createdAt.gte || createdAt.lt ? { createdAt } : {};
}

/**
 * Daily count of images generated across every user, for the admin-wide usage
 * area chart. Optionally restricted to a day range.
 */
export async function getGeneratedImageUsageByDayAllUsers(
  range?: UsageDateRange,
): Promise<GeneratedImageUsagePoint[]> {
  const rows = await prisma.generatedImage.findMany({
    where: buildUsageWhere(range),
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return bucketUsageByDay(rows);
}

export interface ModelUsageSeries {
  /** Stable, CSS-variable-safe series key (e.g. `model-0`). */
  key: string;
  /** Human-readable model name (or "Default model"). */
  label: string;
}

export interface ModelUsagePoint {
  /** UTC day in `YYYY-MM-DD` format. */
  date: string;
  /** Count per series key for that day (every series key is present). */
  counts: Record<string, number>;
}

export interface ModelUsageOverTime {
  series: ModelUsageSeries[];
  points: ModelUsagePoint[];
}

/**
 * Daily image counts split by model, for the admin "generations per model over
 * time" chart. Series are ordered by total volume (most-used first) and keyed
 * with stable identifiers safe to use as CSS variables. Missing days are filled
 * with zero so the stacked area chart renders a continuous timeline.
 */
export async function getGeneratedImageUsageByModelByDay(
  range?: UsageDateRange,
): Promise<ModelUsageOverTime> {
  const rows = await prisma.generatedImage.findMany({
    where: buildUsageWhere(range),
    select: { createdAt: true, model: true },
    orderBy: { createdAt: "asc" },
  });

  if (rows.length === 0) {
    return { series: [], points: [] };
  }

  const totalsByLabel = new Map<string, number>();
  for (const row of rows) {
    const label = row.model ?? DEFAULT_MODEL_LABEL;
    totalsByLabel.set(label, (totalsByLabel.get(label) ?? 0) + 1);
  }

  const series: ModelUsageSeries[] = [...totalsByLabel.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label], index) => ({ key: `model-${index}`, label }));
  const keyByLabel = new Map(series.map((item) => [item.label, item.key]));

  const countsByDay = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const day = toUtcDayKey(row.createdAt);
    const key = keyByLabel.get(row.model ?? DEFAULT_MODEL_LABEL)!;
    let dayCounts = countsByDay.get(day);
    if (!dayCounts) {
      dayCounts = new Map();
      countsByDay.set(day, dayCounts);
    }
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
  }

  const firstDay = new Date(`${toUtcDayKey(rows[0]!.createdAt)}T00:00:00.000Z`);
  const lastDay = new Date(
    `${toUtcDayKey(rows[rows.length - 1]!.createdAt)}T00:00:00.000Z`,
  );

  const points: ModelUsagePoint[] = [];
  for (
    const cursor = new Date(firstDay);
    cursor.getTime() <= lastDay.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const day = toUtcDayKey(cursor);
    const dayCounts = countsByDay.get(day);
    const counts: Record<string, number> = {};
    for (const item of series) {
      counts[item.key] = dayCounts?.get(item.key) ?? 0;
    }
    points.push({ date: day, counts });
  }

  return { series, points };
}

export interface GeneratedImageUsageSummary {
  totalImages: number;
  totalUsers: number;
  completed: number;
  failed: number;
}

export interface GeneratedImageBreakdownItem {
  label: string;
  count: number;
}

export interface TopGeneratingUser {
  userId: string;
  name: string;
  email: string;
  count: number;
}

export interface AdminImageUsageOverview {
  summary: GeneratedImageUsageSummary;
  providers: GeneratedImageBreakdownItem[];
  models: GeneratedImageBreakdownItem[];
  topUsers: TopGeneratingUser[];
}

const DEFAULT_MODEL_LABEL = "Default model";

/**
 * High-level, all-user image-generation metrics for the admin usage dashboard:
 * headline counts, a provider breakdown, and the most active generators. All
 * figures honour the optional day range so they stay in sync with the chart.
 */
export async function getAdminImageUsageOverview(
  range?: UsageDateRange,
  topUserLimit = 10,
): Promise<AdminImageUsageOverview> {
  const where = buildUsageWhere(range);

  const [
    totalImages,
    distinctUsers,
    statusGroups,
    providerGroups,
    modelGroups,
    topUserGroups,
  ] = await Promise.all([
    prisma.generatedImage.count({ where }),
    prisma.generatedImage.groupBy({ by: ["userId"], where }),
    prisma.generatedImage.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.generatedImage.groupBy({
      by: ["provider"],
      where,
      _count: { _all: true },
      orderBy: { _count: { provider: "desc" } },
    }),
    prisma.generatedImage.groupBy({
      by: ["model"],
      where,
      _count: { _all: true },
    }),
    prisma.generatedImage.groupBy({
      by: ["userId"],
      where,
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
      take: topUserLimit,
    }),
  ]);

  const statusCounts = new Map<string, number>(
    statusGroups.map((group) => [group.status, group._count._all]),
  );

  const userRecords = await prisma.user.findMany({
    where: { id: { in: topUserGroups.map((group) => group.userId) } },
    select: { id: true, name: true, email: true },
  });
  const userById = new Map(userRecords.map((record) => [record.id, record]));

  return {
    summary: {
      totalImages,
      totalUsers: distinctUsers.length,
      completed: statusCounts.get("completed") ?? 0,
      failed: statusCounts.get("failed") ?? 0,
    },
    providers: providerGroups.map((group) => ({
      label: group.provider,
      count: group._count._all,
    })),
    // `model` is nullable, so order in JS (Prisma can't sort by `_count._all`).
    models: modelGroups
      .map((group) => ({
        label: group.model ?? DEFAULT_MODEL_LABEL,
        count: group._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    topUsers: topUserGroups.map((group) => {
      const record = userById.get(group.userId);
      return {
        userId: group.userId,
        name: record?.name ?? "Unknown user",
        email: record?.email ?? "—",
        count: group._count._all,
      };
    }),
  };
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
