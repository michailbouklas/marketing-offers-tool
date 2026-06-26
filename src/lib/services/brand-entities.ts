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
 */

export const brandEntityTypes = [
  "competitionRestaurant",
  "googleReviewsBusiness",
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
 * Validates an `entityId` for the given type. Competition ids must be the
 * `"<int>:<int>"` composite; Google business ids are any non-empty cid string.
 */
export function isValidEntityId(
  entityType: BrandEntityType,
  entityId: string,
): boolean {
  if (entityType === "competitionRestaurant") {
    return decodeCompetitionEntityId(entityId) !== null;
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
  /** Resolved from the ClickHouse replica; null when the entity is unknown. */
  displayName: string | null;
  /** Secondary label: aggregator name (competition) or category (google). */
  subLabel: string | null;
  createdBy: string | null;
  createdAt: string; // UTC ISO string
};

/** The brand an entity is currently assigned to (reverse lookup result). */
export type EntityBrandRef = {
  brandId: number;
  brandName: string;
};
