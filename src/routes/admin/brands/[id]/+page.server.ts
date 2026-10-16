import { error } from "@sveltejs/kit";
import { isAdminRole } from "$lib/auth/roles";
import {
  getAuthenticatedUserRole,
  requirePermission,
} from "$lib/server/auth-guards";
import { isGoogleAnalyticsCryptoConfigured } from "$lib/server/google-analytics-crypto.server";
import { prisma } from "$lib/server/prisma";
import { listPropertiesForBrandAdmin } from "$lib/services/google-analytics/properties.server";
import {
  getBrandGuidelines,
  listBrandAssets,
} from "$lib/services/brand-context/brand-context.server";
import { resolveAggregatorStoreNames } from "$lib/services/aggregator-kpis/brand-stores.server";
import { listBrandAssignments } from "$lib/services/brand-entities.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { brand: ["manage"] });

  const brandId = Number.parseInt(event.params.id ?? "", 10);
  if (!Number.isInteger(brandId) || brandId <= 0) {
    error(400, "Invalid brand id");
  }

  const brandRecord = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
      alias: true,
      ideal_fc_perc: true,
    },
  });
  if (!brandRecord) {
    error(404, "Brand not found");
  }

  const { ideal_fc_perc, ...brand } = brandRecord;
  // Stored as a fraction (0.3000); the page edits it as a percent (30).
  const idealFcPercent =
    ideal_fc_perc === null
      ? null
      : Math.round(Number(ideal_fc_perc.toString()) * 100 * 100) / 100;

  const [assets, guidelines, assignments, googleAnalyticsProperties, role] =
    await Promise.all([
      listBrandAssets(brand.id),
      brand.slug ? getBrandGuidelines(brand.slug) : Promise.resolve(null),
      // Store names live in the merchant-scrapes replica, which the assignment
      // service deliberately doesn't reach into — inject the resolver here.
      listBrandAssignments(
        { brandId: brand.id },
        { aggregatorStore: resolveAggregatorStoreNames },
      ),
      listPropertiesForBrandAdmin(brand.id),
      getAuthenticatedUserRole(event),
    ]);

  return {
    brand,
    idealFcPercent,
    assignments,
    googleAnalytics: {
      properties: googleAnalyticsProperties,
      // Uploading Google credentials is an admin power; brand managers (who
      // also hold `brand: ["manage"]`) see the list read-only.
      canManage: isAdminRole(role),
      configured: isGoogleAnalyticsCryptoConfigured(),
    },
    assets: assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      displayName: asset.displayName,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes,
      createdAt:
        asset.createdAt instanceof Date
          ? asset.createdAt.toISOString()
          : String(asset.createdAt),
    })),
    guidelines: guidelines ?? "",
  };
};
