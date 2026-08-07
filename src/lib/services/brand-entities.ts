/**
 * Browser-safe types and helpers for brand ↔ scraped-entity assignments.
 * Server-only Prisma / ClickHouse queries live in the sibling
 * `brand-entities.server.ts` module.
 *
 * An entity is identified by an `entityType` plus a stable string `entityId`,
 * using the same encoding as `user_monitor`:
 *  - `competitionRestaurant` → `"${processorId}:${restaurantId}"`
 *  - `googleReviewsBusiness` → `businesses.cid` (a numeric-looking string —
 *    never coerce it to a number; precision loss).
 *  - `aggregatorStore` → `"${aggregator}:${externalId}"` in the
 *    merchant-scrapes DB (e.g. `"FOODY:FY_CY;493"`).
 */
import type { AggregatorValue } from "$lib/services/aggregator-kpis/aggregator-kpis";

export const brandEntityTypes = [
  "competitionRestaurant",
  "googleReviewsBusiness",
  "aggregatorStore",
] as const;

export type BrandEntityType = (typeof brandEntityTypes)[number];

export function isBrandEntityType(value: unknown): value is BrandEntityType {
  return (
    typeof value === "string" &&
    (brandEntityTypes as readonly string[]).includes(value)
  );
}

export type CompetitionEntityKey = {
  processorId: number;
  restaurantId: number;
};

/** Encodes a competition restaurant into its stable `entityId`. */
export function encodeCompetitionEntityId(
  processorId: number,
  restaurantId: number,
): string {
  return `${processorId}:${restaurantId}`;
}

/**
 * Decodes a `competitionRestaurant` entityId back into its numeric parts.
 * Returns null when the string is not a well-formed `"<int>:<int>"`.
 */
export function decodeCompetitionEntityId(
  entityId: string,
): CompetitionEntityKey | null {
  const match = /^(\d+):(\d+)$/.exec(entityId);

  if (!match) {
    return null;
  }

  return {
    processorId: Number.parseInt(match[1], 10),
    restaurantId: Number.parseInt(match[2], 10),
  };
}

/**
 * Aggregators the KPI section scrapes. Declared locally (rather than importing
 * the runtime `aggregators` tuple) to keep this leaf module off the large
 * `aggregator-kpis.ts` import graph; `satisfies` makes drift a compile error.
 */
const storeAggregators = [
  "FOODY",
  "WOLT",
] as const satisfies readonly AggregatorValue[];

export type AggregatorStoreKey = {
  aggregator: AggregatorValue;
  externalId: string;
};

/** Encodes a merchant-scrapes store into its stable `entityId`. */
export function encodeAggregatorStoreEntityId(
  aggregator: AggregatorValue,
  externalId: string,
): string {
  return `${aggregator}:${externalId}`;
}

/**
 * Decodes an `aggregatorStore` entityId back into its parts. Splits on the
 * **first** colon only: `Aggregator` is a colon-free `[A-Z]+` alphabet, but
 * `externalId` contains `;` / `-` and may itself contain `:`. Returns null for
 * an unknown aggregator or an empty externalId.
 */
export function decodeAggregatorStoreEntityId(
  entityId: string,
): AggregatorStoreKey | null {
  const separator = entityId.indexOf(":");

  if (separator <= 0) {
    return null;
  }

  const aggregator = entityId.slice(0, separator);
  const externalId = entityId.slice(separator + 1);

  if (!(storeAggregators as readonly string[]).includes(aggregator)) {
    return null;
  }

  if (externalId.length === 0) {
    return null;
  }

  return { aggregator: aggregator as AggregatorValue, externalId };
}

/**
 * Validates an `entityId` for the given type. Competition ids must be the
 * `"<int>:<int>"` composite; aggregator store ids must be
 * `"<AGGREGATOR>:<externalId>"`; Google business ids are any non-empty cid.
 */
export function isValidEntityId(
  entityType: BrandEntityType,
  entityId: string,
): boolean {
  if (entityType === "competitionRestaurant") {
    return decodeCompetitionEntityId(entityId) !== null;
  }

  if (entityType === "aggregatorStore") {
    return decodeAggregatorStoreEntityId(entityId) !== null;
  }

  return entityId.trim().length > 0;
}

/** One brand→entity assignment with the resolved entity display name. */
export type BrandAssignmentRow = {
  id: string;
  brandId: number;
  brandName: string;
  entityType: BrandEntityType;
  entityId: string;
  /** Resolved from the replica holding the entity; null when it is unknown. */
  displayName: string | null;
  /**
   * Secondary label: aggregator name (competition), category (google), or the
   * external store id (aggregator store).
   */
  subLabel: string | null;
  createdBy: string | null;
  createdAt: string; // UTC ISO string
};

/** The brand an entity is currently assigned to (reverse lookup result). */
export type EntityBrandRef = {
  brandId: number;
  brandName: string;
};

/**
 * A searchable entity the admin can assign to a brand, annotated with its
 * current assignment (if any) so the picker can show "already assigned" /
 * "will move from brand X".
 */
export type EntityCandidateRow = {
  entityType: BrandEntityType;
  entityId: string; // encoded ("processorId:restaurantId") or cid
  displayName: string;
  /** Aggregator name (competition) or category (google reviews). */
  subLabel: string | null;
  assignedBrandId: number | null;
  assignedBrandName: string | null;
};
