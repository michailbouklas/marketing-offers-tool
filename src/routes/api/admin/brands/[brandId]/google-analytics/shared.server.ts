import { error, type RequestEvent } from "@sveltejs/kit";
import { requireApiAdminPermission } from "$lib/server/auth-guards";
import { prisma } from "$lib/server/prisma";
import {
  findPropertyForBrand,
  GoogleAnalyticsPropertyConflictError,
  GoogleAnalyticsPropertyValidationError,
} from "$lib/services/google-analytics/properties.server";
import { GoogleAnalyticsCryptoUnavailableError } from "$lib/server/google-analytics-crypto.server";
import type { GoogleAnalyticsPropertyAdminRow } from "$lib/services/google-analytics/google-analytics";

/**
 * Shared guard + param parsing for the `/api/admin/brands/[brandId]/google-analytics`
 * routes. Writes to Google credentials are an admin power (admin or superUser
 * holding `brand: ["manage"]`), deliberately excluding `brandManager`, who can
 * otherwise edit the brand page.
 */
export async function requireGoogleAnalyticsAdmin(event: RequestEvent) {
  return requireApiAdminPermission(event, { brand: ["manage"] });
}

export function parseBrandId(param: string | undefined): number {
  if (!param) {
    error(400, "brandId is required");
  }
  const id = Number.parseInt(param, 10);
  if (!Number.isInteger(id) || id <= 0) {
    error(400, "brandId must be a positive integer");
  }
  return id;
}

export async function brandOr404(brandId: number): Promise<{ id: number }> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true },
  });
  if (!brand) {
    error(404, "Brand not found");
  }
  return brand;
}

export async function propertyOr404(
  brandId: number,
  propertyRowId: string | undefined,
): Promise<GoogleAnalyticsPropertyAdminRow> {
  if (!propertyRowId) {
    error(400, "property id is required");
  }
  const property = await findPropertyForBrand(brandId, propertyRowId);
  if (!property) {
    error(404, "Google Analytics property not found for this brand");
  }
  return property;
}

export async function readJsonBody(event: RequestEvent): Promise<unknown> {
  try {
    return await event.request.json();
  } catch {
    error(400, "Expected JSON body");
  }
}

/** Maps service errors to HTTP statuses; rethrows anything unexpected. */
export function throwForServiceError(err: unknown): never {
  if (err instanceof GoogleAnalyticsPropertyValidationError) {
    error(400, err.message);
  }
  if (err instanceof GoogleAnalyticsPropertyConflictError) {
    error(409, err.message);
  }
  if (err instanceof GoogleAnalyticsCryptoUnavailableError) {
    error(503, err.message);
  }
  throw err;
}
