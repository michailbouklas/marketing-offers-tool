import { requirePermission } from "$lib/server/auth-guards";
import { hasOpenAIProvider } from "$lib/server/env";
import { prisma } from "$lib/server/prisma";
import { listBrandsForUser } from "$lib/services/brands.server";
import type { OfferOption } from "./composer-types";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { user } = await requirePermission(event, {
    copywriter: ["generate"],
  });

  const [brands, offerRows] = await Promise.all([
    listBrandsForUser(user!.id, { active: true }),
    prisma.aggregator_offers.findMany({
      where: {
        active: true,
        brand: { user_assignments: { some: { userId: user!.id } } },
      },
      select: {
        id: true,
        name: true,
        aggregator: true,
        brand_id: true,
        starts_at: true,
        ends_at: true,
      },
      orderBy: [{ starts_at: "desc" }, { id: "desc" }],
      take: 200,
    }),
  ]);

  const offers: OfferOption[] = offerRows.map((offer) => ({
    id: offer.id,
    name: offer.name,
    aggregator: offer.aggregator,
    brandId: offer.brand_id,
    startsAt: offer.starts_at.toISOString(),
    endsAt: offer.ends_at.toISOString(),
  }));

  return { brands, offers, openAIConfigured: hasOpenAIProvider() };
};
