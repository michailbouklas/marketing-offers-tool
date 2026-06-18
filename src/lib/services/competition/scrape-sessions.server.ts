import { clickhouse } from "$lib/server/clickhouse";
import {
  competitionTable,
  parseCount,
  utcIsoExpression,
} from "$lib/server/competition-db";
import type {
  ScrapeSessionRow,
  ScrapeSessionsPage,
} from "$lib/services/competition/scrape-sessions";

type CountRow = {
  total: string | number;
};

type ScrapeSessionQueryRow = {
  id: number;
  restaurant_id?: number | null;
  restaurant_name?: string | null;
  aggregator_id: number;
  aggregator_name?: string | null;
  source_url: string;
  language: string;
  scraped_at_iso?: string | null;
  duration_ms?: number | null;
  category_count: number;
  item_count: number;
  offer_count: number;
  markdown_path?: string | null;
  json_path?: string | null;
  status: string;
  error_message?: string | null;
  created_at_iso?: string | null;
};

export type ListScrapeSessionsOptions = {
  page: number;
  pageSize: number;
};

function getSafePagination(options: ListScrapeSessionsOptions) {
  const safePage =
    Number.isFinite(options.page) && options.page > 0
      ? Math.trunc(options.page)
      : 1;
  const safePageSize =
    Number.isFinite(options.pageSize) && options.pageSize > 0
      ? Math.trunc(options.pageSize)
      : 50;

  return { safePage, safePageSize };
}

function mapScrapeSessionRow(row: ScrapeSessionQueryRow): ScrapeSessionRow {
  return {
    id: row.id,
    restaurantId: row.restaurant_id ?? null,
    restaurantName: row.restaurant_name ?? null,
    aggregatorId: row.aggregator_id,
    aggregatorName: row.aggregator_name ?? null,
    sourceUrl: row.source_url,
    language: row.language,
    scrapedAt: row.scraped_at_iso ?? null,
    durationMs: row.duration_ms ?? null,
    categoryCount: row.category_count,
    itemCount: row.item_count,
    offerCount: row.offer_count,
    markdownPath: row.markdown_path ?? null,
    jsonPath: row.json_path ?? null,
    status: row.status,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at_iso ?? null,
  };
}

export async function listScrapeSessionsPage(
  options: ListScrapeSessionsOptions,
): Promise<ScrapeSessionsPage> {
  const { safePage, safePageSize } = getSafePagination(options);

  const countResult = await clickhouse.query({
    query: `
      SELECT count() AS total
      FROM ${competitionTable("scrape_session")} AS s FINAL
    `,
    format: "JSONEachRow",
  });
  const countRows = await countResult.json<CountRow>();
  const totalItems = parseCount(countRows[0]?.total);
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const effectivePage = Math.min(safePage, totalPages);
  const offset = (effectivePage - 1) * safePageSize;

  const rowsResult = await clickhouse.query({
    query: `
      SELECT
        s.id AS id,
        s.restaurant_id AS restaurant_id,
        r.name AS restaurant_name,
        s.aggregator_id AS aggregator_id,
        coalesce(nullIf(a.display_name, ''), a.name) AS aggregator_name,
        s.source_url AS source_url,
        s.language AS language,
        ${utcIsoExpression("s.scraped_at")} AS scraped_at_iso,
        s.duration_ms AS duration_ms,
        s.category_count AS category_count,
        s.item_count AS item_count,
        s.offer_count AS offer_count,
        s.markdown_path AS markdown_path,
        s.json_path AS json_path,
        s.status AS status,
        s.error_message AS error_message,
        ${utcIsoExpression("s.created_at")} AS created_at_iso
      FROM ${competitionTable("scrape_session")} AS s FINAL
      LEFT JOIN ${competitionTable("restaurant")} AS r FINAL ON r.id = ifNull(s.restaurant_id, -1)
      LEFT JOIN ${competitionTable("aggregator")} AS a FINAL ON a.id = s.aggregator_id
      ORDER BY s.scraped_at DESC, s.id DESC
      LIMIT {limit:UInt32}
      OFFSET {offset:UInt32}
    `,
    query_params: {
      limit: safePageSize,
      offset,
    },
    format: "JSONEachRow",
  });
  const rows = await rowsResult.json<ScrapeSessionQueryRow>();

  return {
    items: rows.map(mapScrapeSessionRow),
    page: effectivePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
  };
}
