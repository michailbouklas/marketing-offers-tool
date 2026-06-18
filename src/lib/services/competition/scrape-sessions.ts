import type { Paginated } from "$lib/services/competition/competition";

export type ScrapeSessionRow = {
  id: number;
  restaurantId: number | null;
  restaurantName: string | null;
  aggregatorId: number;
  aggregatorName: string | null;
  sourceUrl: string;
  language: string;
  scrapedAt: string | null;
  durationMs: number | null;
  categoryCount: number;
  itemCount: number;
  offerCount: number;
  markdownPath: string | null;
  jsonPath: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string | null;
};

export type ScrapeSessionsPage = Paginated<ScrapeSessionRow>;
