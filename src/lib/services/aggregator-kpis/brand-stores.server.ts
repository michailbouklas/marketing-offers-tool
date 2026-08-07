/**
 * Brand ↔ aggregator-KPI store mapping. A physical restaurant is one `Store`
 * row per aggregator with unrelated `externalId`s and possibly different
 * display names, and the merchant-scrapes DB holds no cross-aggregator link:
 *
 *   "There is no cross-aggregator merchant mapping in this DB. […] The pairing
 *    is yours to own (a mapping table on your side, or name matching you
 *    control)." — docs/specs/frontend-handoff-wolt-period-queries.md §2
 *
 * We own it via `brand_entity` rows of type `aggregatorStore`, keyed on the
 * `"${aggregator}:${externalId}"` natural key rather than `Store.id` (that DB
 * is a read-only mirror; its autoincrement ids are not ours to depend on).
 *
 * This module is deliberately separate from `brand-entities.server.ts`: it
 * depends on that module, so folding store logic in there would create an
 * import cycle and make one file the junction of three datasources. Since the
 * two databases cannot be joined, every function here is one query per side
 * merged in JS.
 */
import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import { prisma } from "$lib/server/prisma";
import type {
  AggregatorValue,
  BrandScopeFilters,
} from "$lib/services/aggregator-kpis/aggregator-kpis";
import {
  decodeAggregatorStoreEntityId,
  encodeAggregatorStoreEntityId,
  type EntityBrandRef,
  type EntityCandidateRow,
} from "$lib/services/brand-entities";
import { getBrandRefsByEntityIds } from "$lib/services/brand-entities.server";

/** One store on one platform, left-joined to its brand assignment. */
export type AggregatorStoreAssignmentRow = {
  storeId: number;
  externalId: string;
  /** `"${aggregator}:${externalId}"` — the `brand_entity.entityId`. */
  entityId: string;
  name: string | null;
  aggregator: AggregatorValue;
  brandId: number | null;
  brandName: string | null;
  /** `brand_entity.id`, for the by-id DELETE endpoint; null when unassigned. */
  assignmentId: string | null;
};

/** Number of candidates returned by a single search; refine the query for more. */
const CANDIDATE_SEARCH_LIMIT = 50;

/**
 * Resolves `aggregatorStore` entityIds to merchant-scrapes stores.
 *
 * Groups the ids into one `IN` list per aggregator rather than an OR of N
 * `{aggregator, externalId}` pairs, so both predicates hit the
 * `@@unique([aggregator, externalId])` index. Ids that don't decode, or that
 * name a store which no longer exists, are simply absent from the result.
 */
async function findStoresByEntityIds(entityIds: string[]) {
  const externalIdsByAggregator = new Map<AggregatorValue, string[]>();

  for (const entityId of entityIds) {
    const decoded = decodeAggregatorStoreEntityId(entityId);
    if (!decoded) {
      continue;
    }
    const bucket = externalIdsByAggregator.get(decoded.aggregator) ?? [];
    bucket.push(decoded.externalId);
    externalIdsByAggregator.set(decoded.aggregator, bucket);
  }

  if (externalIdsByAggregator.size === 0) {
    return [];
  }

  return merchantScrapesPrisma.store.findMany({
    where: {
      OR: [...externalIdsByAggregator].map(([aggregator, externalIds]) => ({
        aggregator,
        externalId: { in: externalIds },
      })),
    },
    select: { id: true, name: true, aggregator: true, externalId: true },
  });
}

/**
 * Every store on a platform with its current brand, ordered by name. Powers the
 * store-centric admin table, which needs unassigned stores visible too — hence
 * a left join rather than a lookup driven by the assignment rows.
 */
export async function listAggregatorStoreAssignments(
  aggregator: AggregatorValue,
): Promise<AggregatorStoreAssignmentRow[]> {
  const stores = await merchantScrapesPrisma.store.findMany({
    where: { aggregator },
    select: { id: true, name: true, aggregator: true, externalId: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  if (stores.length === 0) {
    return [];
  }

  const assignments = await prisma.brand_entity.findMany({
    where: {
      entityType: "aggregatorStore",
      entityId: {
        in: stores.map((store) =>
          encodeAggregatorStoreEntityId(
            store.aggregator as AggregatorValue,
            store.externalId,
          ),
        ),
      },
    },
    select: {
      id: true,
      entityId: true,
      brandId: true,
      brand: { select: { name: true } },
    },
  });

  const byEntityId = new Map(assignments.map((row) => [row.entityId, row]));

  return stores.map((store) => {
    const entityId = encodeAggregatorStoreEntityId(
      store.aggregator as AggregatorValue,
      store.externalId,
    );
    const assignment = byEntityId.get(entityId);

    return {
      storeId: store.id,
      externalId: store.externalId,
      entityId,
      name: store.name,
      aggregator: store.aggregator as AggregatorValue,
      brandId: assignment?.brandId ?? null,
      brandName: assignment?.brand.name ?? null,
      assignmentId: assignment?.id ?? null,
    };
  });
}

/**
 * Store ids belonging to a brand, optionally narrowed to one platform. Returns
 * `[]` when the brand owns no store in scope — callers must treat that as
 * "zero rows", not "no filter".
 */
export async function getStoreIdsForBrand(
  brandId: number,
  aggregator: AggregatorValue | null,
): Promise<number[]> {
  const assignments = await prisma.brand_entity.findMany({
    where: { brandId, entityType: "aggregatorStore" },
    select: { entityId: true },
  });

  if (assignments.length === 0) {
    return [];
  }

  const stores = await findStoresByEntityIds(
    assignments.map((row) => row.entityId),
  );

  return stores
    .filter((store) => aggregator === null || store.aggregator === aggregator)
    .map((store) => store.id);
}

/**
 * Resolves a filter's `brandId` into `storeIds` for the query layer. A filter
 * with no brand passes through untouched (`storeIds` stays null = no filter).
 */
export async function withBrandStores<T extends BrandScopeFilters>(
  filters: T,
  aggregator: AggregatorValue | null,
): Promise<T> {
  if (filters.brandId === null) {
    return filters;
  }

  return {
    ...filters,
    storeIds: await getStoreIdsForBrand(filters.brandId, aggregator),
  };
}

/** The brand a store is grouped under, keyed by `Store.id`; absent when none. */
export async function getBrandRefsByStoreIds(
  storeIds: number[],
): Promise<Map<number, EntityBrandRef>> {
  const refs = new Map<number, EntityBrandRef>();

  if (storeIds.length === 0) {
    return refs;
  }

  const stores = await merchantScrapesPrisma.store.findMany({
    where: { id: { in: storeIds } },
    select: { id: true, aggregator: true, externalId: true },
  });

  const entityIdByStoreId = new Map(
    stores.map((store) => [
      store.id,
      encodeAggregatorStoreEntityId(
        store.aggregator as AggregatorValue,
        store.externalId,
      ),
    ]),
  );

  const byEntityId = await getBrandRefsByEntityIds("aggregatorStore", [
    ...entityIdByStoreId.values(),
  ]);

  for (const [storeId, entityId] of entityIdByStoreId) {
    const ref = byEntityId.get(entityId);
    if (ref) {
      refs.set(storeId, ref);
    }
  }

  return refs;
}

/**
 * Batch-resolves store names for `listBrandAssignments`, which injects this as
 * the `aggregatorStore` resolver so `brand-entities.server.ts` need not import
 * the merchant-scrapes client itself.
 */
export async function resolveAggregatorStoreNames(
  entityIds: string[],
): Promise<
  Map<string, { displayName: string | null; subLabel: string | null }>
> {
  const names = new Map<
    string,
    { displayName: string | null; subLabel: string | null }
  >();

  if (entityIds.length === 0) {
    return names;
  }

  const stores = await findStoresByEntityIds(entityIds);

  for (const store of stores) {
    names.set(
      encodeAggregatorStoreEntityId(
        store.aggregator as AggregatorValue,
        store.externalId,
      ),
      { displayName: store.name, subLabel: store.externalId },
    );
  }

  return names;
}

/**
 * Fuzzy-searches stores by name across both platforms, annotated with their
 * current brand. Backs the brand-first picker on `/admin/brands/[id]`; the
 * store-first admin table filters its already-loaded rows client-side instead.
 */
export async function searchAggregatorStoreCandidates(
  query: string,
): Promise<EntityCandidateRow[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const stores = await merchantScrapesPrisma.store.findMany({
    where: { name: { contains: trimmed, mode: "insensitive" } },
    select: { id: true, name: true, aggregator: true, externalId: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: CANDIDATE_SEARCH_LIMIT,
  });

  const rows = stores.map((store) => ({
    entityId: encodeAggregatorStoreEntityId(
      store.aggregator as AggregatorValue,
      store.externalId,
    ),
    displayName: store.name ?? `Store #${store.id}`,
    subLabel: `${store.aggregator} · ${store.externalId}`,
  }));

  const refs = await getBrandRefsByEntityIds(
    "aggregatorStore",
    rows.map((row) => row.entityId),
  );

  return rows.map((row) => {
    const ref = refs.get(row.entityId);
    return {
      entityType: "aggregatorStore" as const,
      entityId: row.entityId,
      displayName: row.displayName,
      subLabel: row.subLabel,
      assignedBrandId: ref?.brandId ?? null,
      assignedBrandName: ref?.brandName ?? null,
    };
  });
}
