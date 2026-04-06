import type { AggregatorOffer } from "$lib/services/aggregator-offers";
import { prisma } from "$lib/server/prisma";

export type HomeOfferWidgetPreview = Pick<
  AggregatorOffer,
  "id" | "offer_id" | "name" | "brand" | "aggregator" | "ends_at"
>;

export type HomeOfferWidget = {
  count: number;
  href: string;
  preview: HomeOfferWidgetPreview[];
};

export type HomeOfferWidgets = {
  activeOffers: HomeOfferWidget;
  expiringSoon: HomeOfferWidget;
  recentlyExpired: HomeOfferWidget;
};

const offerPreviewSelect = {
  id: true,
  offer_id: true,
  name: true,
  brand: {
    select: {
      id: true,
      name: true,
      alias: true,
      slug: true,
      active: true,
    },
  },
  aggregator: true,
  ends_at: true,
} as const;

function getStartOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getEndOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

export async function getHomeOfferWidgets(
  now = new Date(),
): Promise<HomeOfferWidgets> {
  const expiringTargetDay = addDays(getStartOfDay(now), 2);
  const expiringDayEnd = getEndOfDay(expiringTargetDay);
  const recentWindowStart = addDays(getStartOfDay(now), -2);

  const activeWhere = {
    active: true,
    starts_at: {
      lte: now,
    },
    ends_at: {
      gte: now,
    },
  };

  const expiringSoonWhere = {
    active: true,
    starts_at: {
      lte: now,
    },
    ends_at: {
      gte: expiringTargetDay,
      lte: expiringDayEnd,
    },
  };

  const recentlyExpiredWhere = {
    ends_at: {
      gte: recentWindowStart,
      lt: now,
    },
  };

  const [
    activeCount,
    activePreview,
    expiringCount,
    expiringPreview,
    expiredCount,
    expiredPreview,
  ] = await Promise.all([
    prisma.aggregator_offers.count({ where: activeWhere }),
    prisma.aggregator_offers.findMany({
      where: activeWhere,
      select: offerPreviewSelect,
      orderBy: [{ ends_at: "asc" }, { id: "desc" }],
      take: 3,
    }),
    prisma.aggregator_offers.count({ where: expiringSoonWhere }),
    prisma.aggregator_offers.findMany({
      where: expiringSoonWhere,
      select: offerPreviewSelect,
      orderBy: [{ ends_at: "asc" }, { id: "desc" }],
      take: 3,
    }),
    prisma.aggregator_offers.count({ where: recentlyExpiredWhere }),
    prisma.aggregator_offers.findMany({
      where: recentlyExpiredWhere,
      select: offerPreviewSelect,
      orderBy: [{ ends_at: "desc" }, { id: "desc" }],
      take: 3,
    }),
  ]);

  return {
    activeOffers: {
      count: activeCount,
      href: "/aggregator-offers?lifecyclePreset=active",
      preview: activePreview,
    },
    expiringSoon: {
      count: expiringCount,
      href: "/aggregator-offers?lifecyclePreset=expiringSoon",
      preview: expiringPreview,
    },
    recentlyExpired: {
      count: expiredCount,
      href: "/aggregator-offers?lifecyclePreset=recentlyExpired",
      preview: expiredPreview,
    },
  };
}
