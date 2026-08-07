import {
  type BrandAssignmentRow,
  type BrandEntityType,
  type EntityBrandRef,
  type EntityCandidateRow,
  decodeCompetitionEntityId,
  encodeCompetitionEntityId,
} from "$lib/services/brand-entities";
import { clickhouse } from "$lib/server/clickhouse";
import { competitionTable } from "$lib/server/competition-db";
import { googleReviewsTable } from "$lib/server/google-reviews-db";
import { prisma } from "$lib/server/prisma";

type AssignEntityInput = {
  brandId: number;
  entityType: BrandEntityType;
  entityId: string;
  createdBy?: string | null;
};

/**
 * Assigns a scraped entity to a brand. Because each entity belongs to at most
 * one brand (`@@unique([entityType, entityId])`), re-assigning an entity that
 * is already linked simply **moves** it to the new brand.
 */
export async function assignEntityToBrand(input: AssignEntityInput) {
  const { brandId, entityType, entityId } = input;
  const createdBy = input.createdBy ?? null;

  return prisma.brand_entity.upsert({
    where: { entityType_entityId: { entityType, entityId } },
    create: { brandId, entityType, entityId, createdBy },
    update: { brandId, createdBy },
  });
}

type AssignEntitiesInput = {
  brandId: number;
  entityType: BrandEntityType;
  entityIds: string[];
  createdBy?: string | null;
};

/**
 * Assigns several entities of one type to a brand in a single transaction.
 * Each is an upsert keyed on `entityType_entityId`, so entities already linked
 * to another brand are **moved**. Returns the number of entities processed.
 */
export async function assignEntitiesToBrand(
  input: AssignEntitiesInput,
): Promise<number> {
  const { brandId, entityType } = input;
  const createdBy = input.createdBy ?? null;
  const entityIds = [...new Set(input.entityIds)];

  if (entityIds.length === 0) {
    return 0;
  }

  await prisma.$transaction(
    entityIds.map((entityId) =>
      prisma.brand_entity.upsert({
        where: { entityType_entityId: { entityType, entityId } },
        create: { brandId, entityType, entityId, createdBy },
        update: { brandId, createdBy },
      }),
    ),
  );

  return entityIds.length;
}

/** Removes a single assignment by its id. No-op if it does not exist. */
export async function unassignEntity(id: string) {
  await prisma.brand_entity.deleteMany({ where: { id } });
}

/**
 * Removes several assignments by id in one statement. Returns how many rows
 * were actually deleted (ids that no longer exist are silently ignored).
 */
export async function unassignEntities(ids: string[]): Promise<number> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    return 0;
  }

  const result = await prisma.brand_entity.deleteMany({
    where: { id: { in: uniqueIds } },
  });

  return result.count;
}

type ListBrandAssignmentsFilters = {
  brandId?: number;
  entityType?: BrandEntityType;
};

/** Batch name lookup for one entity type, keyed by `entityId`. */
export type EntityNameResolver = (
  entityIds: string[],
) => Promise<Map<string, ResolvedName>>;

/**
 * Lists brand→entity assignments (optionally filtered by brand and/or type),
 * resolving each entity's display name in one batch query per entity type.
 *
 * The two ClickHouse-backed types resolve natively. `aggregatorStore` lives in
 * the merchant-scrapes replica, so its resolver is **injected** by the caller
 * (`resolveAggregatorStoreNames` from `aggregator-kpis/brand-stores.server`) —
 * that module already depends on this one, and importing it back would create
 * a cycle. An unresolved type simply yields `displayName: null`.
 */
export async function listBrandAssignments(
  filters: ListBrandAssignmentsFilters = {},
  resolvers: Partial<Record<BrandEntityType, EntityNameResolver>> = {},
): Promise<BrandAssignmentRow[]> {
  const assignments = await prisma.brand_entity.findMany({
    where: {
      ...(filters.brandId !== undefined ? { brandId: filters.brandId } : {}),
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
    },
    select: {
      id: true,
      brandId: true,
      entityType: true,
      entityId: true,
      createdBy: true,
      createdAt: true,
      brand: { select: { name: true } },
    },
    orderBy: [{ brandId: "asc" }, { createdAt: "asc" }],
  });

  if (assignments.length === 0) {
    return [];
  }

  const activeResolvers: Partial<Record<BrandEntityType, EntityNameResolver>> =
    {
      competitionRestaurant: resolveCompetitionNames,
      googleReviewsBusiness: resolveGoogleBusinessNames,
      ...resolvers,
    };

  // One batch lookup per entity type actually present in the result.
  const idsByType = new Map<BrandEntityType, string[]>();
  for (const row of assignments) {
    const bucket = idsByType.get(row.entityType) ?? [];
    bucket.push(row.entityId);
    idsByType.set(row.entityType, bucket);
  }

  const resolvedByType = new Map<BrandEntityType, Map<string, ResolvedName>>();
  await Promise.all(
    [...idsByType].map(async ([entityType, entityIds]) => {
      const resolver = activeResolvers[entityType];
      if (!resolver) {
        return;
      }
      resolvedByType.set(entityType, await resolver(entityIds));
    }),
  );

  return assignments.map((row) => {
    const resolved = resolvedByType.get(row.entityType)?.get(row.entityId);

    return {
      id: row.id,
      brandId: row.brandId,
      brandName: row.brand.name,
      entityType: row.entityType,
      entityId: row.entityId,
      displayName: resolved?.displayName ?? null,
      subLabel: resolved?.subLabel ?? null,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/**
 * Reverse lookup used to decorate the competition / google-reviews list pages
 * with their assigned brand. Returns a map keyed by `entityId`; entities that
 * are not assigned are simply absent.
 */
export async function getBrandRefsByEntityIds(
  entityType: BrandEntityType,
  entityIds: string[],
): Promise<Map<string, EntityBrandRef>> {
  const refs = new Map<string, EntityBrandRef>();

  if (entityIds.length === 0) {
    return refs;
  }

  const rows = await prisma.brand_entity.findMany({
    where: { entityType, entityId: { in: entityIds } },
    select: {
      entityId: true,
      brandId: true,
      brand: { select: { name: true } },
    },
  });

  for (const row of rows) {
    refs.set(row.entityId, { brandId: row.brandId, brandName: row.brand.name });
  }

  return refs;
}

/**
 * Returns the `entityId`s of one type assigned to a brand. Used to filter the
 * competition / google-reviews sections by brand (e.g. the brand → business
 * cids for the reviews filter).
 */
export async function getEntityIdsForBrand(
  brandId: number,
  entityType: BrandEntityType,
): Promise<string[]> {
  const rows = await prisma.brand_entity.findMany({
    where: { brandId, entityType },
    select: { entityId: true },
  });

  return rows.map((row) => row.entityId);
}

type ResolvedName = { displayName: string | null; subLabel: string | null };

type CompetitionNameRow = {
  id: number;
  aggregator_id: number;
  name: string | null;
  processor_name: string | null;
};

/**
 * Batch-resolves competition restaurant names from the replica, keyed by the
 * `"${processorId}:${restaurantId}"` entityId. `restaurant.id` is only unique
 * per processor, so the result is keyed by the full composite to stay correct
 * even if ids collide across aggregators.
 */
async function resolveCompetitionNames(
  entityIds: string[],
): Promise<Map<string, ResolvedName>> {
  const names = new Map<string, ResolvedName>();

  const restaurantIds = entityIds
    .map((entityId) => decodeCompetitionEntityId(entityId)?.restaurantId)
    .filter((value): value is number => value !== undefined);

  if (restaurantIds.length === 0) {
    return names;
  }

  const result = await clickhouse.query({
    query: `
      SELECT
        r.id AS id,
        r.aggregator_id AS aggregator_id,
        r.name AS name,
        coalesce(nullIf(a.display_name, ''), a.name) AS processor_name
      FROM ${competitionTable("restaurant")} AS r FINAL
      LEFT JOIN ${competitionTable("aggregator")} AS a FINAL ON a.id = r.aggregator_id
      WHERE r.id IN ({restaurantIds:Array(Int32)})
    `,
    query_params: { restaurantIds },
    format: "JSONEachRow",
  });

  const rows = await result.json<CompetitionNameRow>();

  for (const row of rows) {
    names.set(`${row.aggregator_id}:${row.id}`, {
      displayName: row.name,
      subLabel: row.processor_name,
    });
  }

  return names;
}

type GoogleBusinessNameRow = {
  cid: string;
  title: string | null;
  category: string | null;
};

/**
 * Batch-resolves Google business titles from the replica, keyed by `cid`. The
 * cid is bound as `Array(String)` — never coerce it to a number.
 */
async function resolveGoogleBusinessNames(
  cids: string[],
): Promise<Map<string, ResolvedName>> {
  const names = new Map<string, ResolvedName>();

  if (cids.length === 0) {
    return names;
  }

  const result = await clickhouse.query({
    query: `
      SELECT
        b.cid AS cid,
        b.title AS title,
        b.category AS category
      FROM ${googleReviewsTable("businesses")} AS b FINAL
      WHERE b.cid IN ({cids:Array(String)})
    `,
    query_params: { cids },
    format: "JSONEachRow",
  });

  const rows = await result.json<GoogleBusinessNameRow>();

  for (const row of rows) {
    names.set(row.cid, {
      displayName: row.title,
      subLabel: row.category,
    });
  }

  return names;
}

// --- Candidate search (for the brand-assignment admin picker) ---

/** Number of candidates returned by a single search; refine the query for more. */
const CANDIDATE_SEARCH_LIMIT = 50;

/**
 * Annotates candidate entities with their current brand assignment (if any),
 * preserving the input order. Shared by both search functions.
 */
async function annotateWithAssignment(
  entityType: BrandEntityType,
  rows: Array<{
    entityId: string;
    displayName: string;
    subLabel: string | null;
  }>,
): Promise<EntityCandidateRow[]> {
  const refs = await getBrandRefsByEntityIds(
    entityType,
    rows.map((row) => row.entityId),
  );

  return rows.map((row) => {
    const ref = refs.get(row.entityId);
    return {
      entityType,
      entityId: row.entityId,
      displayName: row.displayName,
      subLabel: row.subLabel,
      assignedBrandId: ref?.brandId ?? null,
      assignedBrandName: ref?.brandName ?? null,
    };
  });
}

type CompetitionCandidateQueryRow = {
  id: number;
  aggregator_id: number;
  name: string | null;
  processor_name: string | null;
};

/**
 * Fuzzy-searches competition restaurants by name (case-insensitive substring,
 * matching the codebase convention `positionCaseInsensitiveUTF8`). Returns up
 * to `CANDIDATE_SEARCH_LIMIT` rows annotated with their current brand.
 */
export async function searchCompetitionRestaurantCandidates(
  query: string,
): Promise<EntityCandidateRow[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const result = await clickhouse.query({
    query: `
      SELECT
        r.id AS id,
        r.aggregator_id AS aggregator_id,
        r.name AS name,
        coalesce(nullIf(a.display_name, ''), a.name) AS processor_name
      FROM ${competitionTable("restaurant")} AS r FINAL
      LEFT JOIN ${competitionTable("aggregator")} AS a FINAL ON a.id = r.aggregator_id
      WHERE positionCaseInsensitiveUTF8(r.name, {query:String}) > 0
      ORDER BY r.name ASC, r.id ASC
      LIMIT {limit:UInt32}
    `,
    query_params: { query: trimmed, limit: CANDIDATE_SEARCH_LIMIT },
    format: "JSONEachRow",
  });

  const rows = await result.json<CompetitionCandidateQueryRow>();

  return annotateWithAssignment(
    "competitionRestaurant",
    rows.map((row) => ({
      entityId: encodeCompetitionEntityId(row.aggregator_id, row.id),
      displayName: row.name ?? "(unnamed)",
      subLabel: row.processor_name,
    })),
  );
}

type GoogleBusinessCandidateQueryRow = {
  cid: string;
  title: string | null;
  category: string | null;
};

/**
 * Fuzzy-searches Google reviews businesses by title (case-insensitive
 * substring). Returns up to `CANDIDATE_SEARCH_LIMIT` rows annotated with their
 * current brand. cid stays a string throughout.
 */
export async function searchGoogleBusinessCandidates(
  query: string,
): Promise<EntityCandidateRow[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const result = await clickhouse.query({
    query: `
      SELECT
        b.cid AS cid,
        b.title AS title,
        b.category AS category
      FROM ${googleReviewsTable("businesses")} AS b FINAL
      WHERE positionCaseInsensitiveUTF8(b.title, {query:String}) > 0
      ORDER BY b.title ASC, b.cid ASC
      LIMIT {limit:UInt32}
    `,
    query_params: { query: trimmed, limit: CANDIDATE_SEARCH_LIMIT },
    format: "JSONEachRow",
  });

  const rows = await result.json<GoogleBusinessCandidateQueryRow>();

  return annotateWithAssignment(
    "googleReviewsBusiness",
    rows.map((row) => ({
      entityId: row.cid,
      displayName: row.title ?? "(untitled)",
      subLabel: row.category,
    })),
  );
}
