import { prisma } from "$lib/server/prisma";
import type {
  AggregatorOffersFilters,
  CreateAggregatorOfferInput,
  UpdateAggregatorOfferInput,
} from "$lib/services/aggregator-offers";

export async function getOffers(filters: AggregatorOffersFilters = {}) {
  const {
    id,
    aggregator,
    offer_id,
    brand_id,
    name,
    details,
    active,
    active_on,
    starts_after,
    starts_before,
    ends_after,
    ends_before,
    created_after,
    created_before,
    updated_after,
    updated_before,
  } = filters;

  const startsAtFilter = {
    ...(starts_after ? { gte: starts_after } : {}),
    ...(starts_before ? { lte: starts_before } : {}),
    ...(active_on ? { lte: active_on } : {}),
  };

  const endsAtFilter = {
    ...(ends_after ? { gte: ends_after } : {}),
    ...(ends_before ? { lte: ends_before } : {}),
    ...(active_on ? { gte: active_on } : {}),
  };

  const createdAtFilter = {
    ...(created_after ? { gte: created_after } : {}),
    ...(created_before ? { lte: created_before } : {}),
  };

  const updatedAtFilter = {
    ...(updated_after ? { gte: updated_after } : {}),
    ...(updated_before ? { lte: updated_before } : {}),
  };

  return prisma.aggregator_offers.findMany({
    where: {
      ...(id !== undefined ? { id } : {}),
      ...(aggregator ? { aggregator } : {}),
      ...(offer_id
        ? { offer_id: { contains: offer_id, mode: "insensitive" } }
        : {}),
      ...(active !== undefined ? { active } : {}),
      ...(brand_id !== undefined ? { brand_id } : {}),
      ...(name ? { name: { contains: name, mode: "insensitive" } } : {}),
      ...(details
        ? { details: { contains: details, mode: "insensitive" } }
        : {}),
      ...(Object.keys(startsAtFilter).length > 0
        ? { starts_at: startsAtFilter }
        : {}),
      ...(Object.keys(endsAtFilter).length > 0
        ? { ends_at: endsAtFilter }
        : {}),
      ...(Object.keys(createdAtFilter).length > 0
        ? { created_at: createdAtFilter }
        : {}),
      ...(Object.keys(updatedAtFilter).length > 0
        ? { updated_at: updatedAtFilter }
        : {}),
    },
    include: {
      brand: {
        select: {
          id: true,
          name: true,
          alias: true,
          slug: true,
          active: true,
        },
      },
    },
    orderBy: [{ starts_at: "desc" }, { id: "desc" }],
  });
}

export async function getOfferById(id: number) {
  return prisma.aggregator_offers.findUnique({
    where: { id },
    include: {
      brand: {
        select: {
          id: true,
          name: true,
          alias: true,
          slug: true,
          active: true,
        },
      },
    },
  });
}

export async function createOffer(data: CreateAggregatorOfferInput) {
  return prisma.aggregator_offers.create({ data });
}

export async function updateOffer(
  id: number,
  data: UpdateAggregatorOfferInput,
) {
  return prisma.aggregator_offers.update({ where: { id }, data });
}

export async function deleteOffer(id: number) {
  return prisma.aggregator_offers.delete({ where: { id } });
}
