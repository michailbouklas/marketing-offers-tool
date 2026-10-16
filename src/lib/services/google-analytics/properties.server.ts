import { error, type RequestEvent } from "@sveltejs/kit";
import type { AppPermissions } from "$lib/auth/permissions";
import { requirePermission } from "$lib/server/auth-guards";
import { invalidateGoogleAnalyticsCache } from "$lib/server/google-analytics-cache.server";
import {
  decryptSecret,
  encryptSecret,
} from "$lib/server/google-analytics-crypto.server";
import { prisma } from "$lib/server/prisma";
import type { BrandOption } from "$lib/services/brands";
import {
  normalizeGoogleAnalyticsPropertyId,
  parseServiceAccountJson,
  serviceAccountCredentialsSchema,
  type GoogleAnalyticsBrandScope,
  type GoogleAnalyticsFilters,
  type GoogleAnalyticsPropertyAdminRow,
  type GoogleAnalyticsPropertyRef,
  type GoogleAnalyticsRange,
  type ServiceAccountCredentials,
} from "./google-analytics";

/** Permission every `/google-analytics` page requires. */
export const GOOGLE_ANALYTICS_PERMISSION = {
  googleAnalytics: ["view"],
} as const satisfies AppPermissions;

/** Thrown for admin input the API should answer with 400. */
export class GoogleAnalyticsPropertyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAnalyticsPropertyValidationError";
  }
}

/** Thrown when the (brand, property id) pair already exists → 409. */
export class GoogleAnalyticsPropertyConflictError extends Error {
  constructor() {
    super("This GA4 property is already linked to the brand.");
    this.name = "GoogleAnalyticsPropertyConflictError";
  }
}

const adminRowSelect = {
  id: true,
  propertyId: true,
  displayName: true,
  active: true,
  sortOrder: true,
  credentialsClientEmail: true,
  credentialsKeyId: true,
  lastVerifiedAt: true,
  lastError: true,
  createdAt: true,
} as const;

type AdminRowRecord = {
  id: string;
  propertyId: string;
  displayName: string;
  active: boolean;
  sortOrder: number;
  credentialsClientEmail: string;
  credentialsKeyId: string | null;
  lastVerifiedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
};

function toAdminRow(row: AdminRowRecord): GoogleAnalyticsPropertyAdminRow {
  return {
    id: row.id,
    propertyId: row.propertyId,
    displayName: row.displayName,
    active: row.active,
    sortOrder: row.sortOrder,
    clientEmail: row.credentialsClientEmail,
    keyId: row.credentialsKeyId,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/** Validates + canonicalises a pasted key and returns the encrypted blob. */
function prepareCredentials(credentialsJson: string): {
  encrypted: string;
  clientEmail: string;
  keyId: string | null;
} {
  const parsed = parseServiceAccountJson(credentialsJson);

  if (!parsed.ok) {
    throw new GoogleAnalyticsPropertyValidationError(parsed.error);
  }

  return {
    // Store only the schema-validated subset, never the raw paste.
    encrypted: encryptSecret(JSON.stringify(parsed.value)),
    clientEmail: parsed.value.client_email,
    keyId: parsed.value.private_key_id ?? null,
  };
}

function requireDisplayName(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed.length > 120) {
    throw new GoogleAnalyticsPropertyValidationError(
      "Display name must be between 1 and 120 characters.",
    );
  }

  return trimmed;
}

// --- Admin CRUD -------------------------------------------------------------------------

export async function listPropertiesForBrandAdmin(
  brandId: number,
): Promise<GoogleAnalyticsPropertyAdminRow[]> {
  const rows = await prisma.brand_google_analytics_property.findMany({
    where: { brandId },
    select: adminRowSelect,
    orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }, { id: "asc" }],
  });

  return rows.map(toAdminRow);
}

export async function findPropertyForBrand(
  brandId: number,
  id: string,
): Promise<GoogleAnalyticsPropertyAdminRow | null> {
  const row = await prisma.brand_google_analytics_property.findFirst({
    where: { id, brandId },
    select: adminRowSelect,
  });

  return row ? toAdminRow(row) : null;
}

export type CreatePropertyInput = {
  brandId: number;
  propertyId: string;
  displayName: string;
  credentialsJson: string;
  createdBy: string | null;
};

export async function createProperty(
  input: CreatePropertyInput,
): Promise<GoogleAnalyticsPropertyAdminRow> {
  const propertyId = normalizeGoogleAnalyticsPropertyId(input.propertyId);

  if (!propertyId) {
    throw new GoogleAnalyticsPropertyValidationError(
      'GA4 property id must be numeric (e.g. "123456789" or "properties/123456789").',
    );
  }

  const displayName = requireDisplayName(input.displayName);
  const credentials = prepareCredentials(input.credentialsJson);

  try {
    const row = await prisma.brand_google_analytics_property.create({
      data: {
        brandId: input.brandId,
        propertyId,
        displayName,
        credentialsEncrypted: credentials.encrypted,
        credentialsClientEmail: credentials.clientEmail,
        credentialsKeyId: credentials.keyId,
        createdBy: input.createdBy,
      },
      select: adminRowSelect,
    });

    invalidateGoogleAnalyticsCache();

    return toAdminRow(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new GoogleAnalyticsPropertyConflictError();
    }

    throw err;
  }
}

export type UpdatePropertyInput = {
  displayName?: string;
  active?: boolean;
  sortOrder?: number;
  /** Replaces the stored key when provided. */
  credentialsJson?: string;
};

export async function updateProperty(
  id: string,
  patch: UpdatePropertyInput,
): Promise<GoogleAnalyticsPropertyAdminRow> {
  const data: {
    displayName?: string;
    active?: boolean;
    sortOrder?: number;
    credentialsEncrypted?: string;
    credentialsClientEmail?: string;
    credentialsKeyId?: string | null;
    lastVerifiedAt?: null;
    lastError?: null;
  } = {};

  if (patch.displayName !== undefined) {
    data.displayName = requireDisplayName(patch.displayName);
  }

  if (patch.active !== undefined) {
    data.active = patch.active;
  }

  if (patch.sortOrder !== undefined) {
    if (!Number.isInteger(patch.sortOrder)) {
      throw new GoogleAnalyticsPropertyValidationError(
        "sortOrder must be an integer.",
      );
    }
    data.sortOrder = patch.sortOrder;
  }

  if (patch.credentialsJson !== undefined) {
    const credentials = prepareCredentials(patch.credentialsJson);
    data.credentialsEncrypted = credentials.encrypted;
    data.credentialsClientEmail = credentials.clientEmail;
    data.credentialsKeyId = credentials.keyId;
    // A new key has not been proven to work yet.
    data.lastVerifiedAt = null;
    data.lastError = null;
  }

  const row = await prisma.brand_google_analytics_property.update({
    where: { id },
    data,
    select: adminRowSelect,
  });

  invalidateGoogleAnalyticsCache();

  return toAdminRow(row);
}

export async function deleteProperty(id: string): Promise<void> {
  await prisma.brand_google_analytics_property.delete({ where: { id } });
  invalidateGoogleAnalyticsCache();
}

/**
 * Server-only: decrypts the stored key for a GA4 call. Never expose the
 * result to a page or API response.
 */
export async function getDecryptedCredentials(id: string): Promise<{
  propertyId: string;
  credentials: ServiceAccountCredentials;
}> {
  const row = await prisma.brand_google_analytics_property.findUniqueOrThrow({
    where: { id },
    select: { propertyId: true, credentialsEncrypted: true },
  });

  const credentials = serviceAccountCredentialsSchema.parse(
    JSON.parse(decryptSecret(row.credentialsEncrypted)),
  );

  return { propertyId: row.propertyId, credentials };
}

export async function recordVerification(
  id: string,
  result: { ok: true } | { ok: false; error: string },
): Promise<void> {
  await prisma.brand_google_analytics_property.update({
    where: { id },
    data: result.ok
      ? { lastVerifiedAt: new Date(), lastError: null }
      : { lastError: result.error.slice(0, 2000) },
  });
}

// --- Viewer scope --------------------------------------------------------------------------

/**
 * Brands the user may view on `/google-analytics`: their own `user_brand`
 * assignments (for every role, admins included — a product decision that
 * deliberately differs from `listScopedBrands`) that are active and have at
 * least one active GA4 property.
 */
export async function listGoogleAnalyticsBrandsForUser(
  userId: string,
): Promise<GoogleAnalyticsBrandScope[]> {
  const brands = await prisma.brand.findMany({
    where: {
      active: true,
      user_assignments: { some: { userId } },
      google_analytics_properties: { some: { active: true } },
    },
    select: {
      id: true,
      name: true,
      alias: true,
      slug: true,
      active: true,
      google_analytics_properties: {
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }, { id: "asc" }],
        select: { id: true, propertyId: true, displayName: true },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  return brands.map(({ google_analytics_properties, ...brand }) => ({
    brand,
    properties: google_analytics_properties,
  }));
}

export type GoogleAnalyticsScope = {
  userId: string;
  brands: GoogleAnalyticsBrandScope[];
  brand: BrandOption | null;
  property: GoogleAnalyticsPropertyRef | null;
  range: GoogleAnalyticsRange;
};

/**
 * Page guard + scope resolution for `/google-analytics`.
 *
 * - no permission → 302 `/` (via `requirePermission`)
 * - no brand requested → first brand in scope (null when the user has none)
 * - brand requested but not in scope → 403 (never reveals whether it exists)
 * - property requested but not on that brand → 403
 */
export async function resolveGoogleAnalyticsScope(
  event: RequestEvent,
  filters: GoogleAnalyticsFilters,
): Promise<GoogleAnalyticsScope> {
  const { user } = await requirePermission(event, GOOGLE_ANALYTICS_PERMISSION);

  if (!user) {
    error(401, "Unauthorized");
  }

  const brands = await listGoogleAnalyticsBrandsForUser(user.id);

  let scoped: GoogleAnalyticsBrandScope | null;

  if (filters.brandId === null) {
    scoped = brands[0] ?? null;
  } else {
    scoped = brands.find((entry) => entry.brand.id === filters.brandId) ?? null;

    if (!scoped) {
      error(403, "This brand is not assigned to you.");
    }
  }

  if (!scoped) {
    return {
      userId: user.id,
      brands,
      brand: null,
      property: null,
      range: filters.range,
    };
  }

  let property: GoogleAnalyticsPropertyRef | null;

  if (filters.propertyId === null) {
    property = scoped.properties[0] ?? null;
  } else {
    property =
      scoped.properties.find((entry) => entry.id === filters.propertyId) ??
      null;

    if (!property) {
      error(403, "This property is not available for the selected brand.");
    }
  }

  return {
    userId: user.id,
    brands,
    brand: scoped.brand,
    property,
    range: filters.range,
  };
}
