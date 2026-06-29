import type { Aggregator } from "$lib/services/aggregator-offers";
import { prisma } from "$lib/server/prisma";

export type CreateUrlToScrapeInput = {
  url: string;
  aggregator: Aggregator;
  userId: string;
};

export async function listUrlsToScrape() {
  return prisma.urls_to_scrape.findMany({
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
    orderBy: { created_at: "desc" },
  });
}

export type UrlToScrapeRecord = Awaited<
  ReturnType<typeof listUrlsToScrape>
>[number];

export async function createUrlToScrape(data: CreateUrlToScrapeInput) {
  const existing = await prisma.urls_to_scrape.findFirst({
    where: { url: data.url },
    select: { id: true },
  });

  if (existing) {
    return { created: false as const };
  }

  await prisma.urls_to_scrape.create({ data });
  return { created: true as const };
}

export async function createUrlsToScrape(
  items: { url: string; aggregator: Aggregator }[],
  userId: string,
) {
  // Ignore URLs that are already registered.
  const existing = await prisma.urls_to_scrape.findMany({
    where: { url: { in: items.map((item) => item.url) } },
    select: { url: true },
  });
  const existingUrls = new Set(existing.map((row) => row.url));

  const toInsert = items.filter((item) => !existingUrls.has(item.url));

  if (toInsert.length === 0) {
    return { added: 0, skipped: items.length };
  }

  const result = await prisma.urls_to_scrape.createMany({
    data: toInsert.map((item) => ({ ...item, userId })),
  });

  return { added: result.count, skipped: items.length - result.count };
}
