import { prisma } from "$lib/server/prisma";
import { Prisma } from "../../generated/prisma/client";
import type {
  GapListItem,
  GapListPage,
  GapListSortDirection,
  GapListSortField,
} from "$lib/services/offers-data-quality";
import { parseMissingFields } from "$lib/services/offers-data-quality";
import type {
  GapQueueSnapshotRowInput,
  SnapshotRefreshInfo,
} from "$lib/services/offers-data-quality-snapshot";

export type { SnapshotRefreshInfo };

/**
 * Postgres access to `dq_gap_queue_snapshot` (the queue "materialized view")
 * and `dq_gap_queue_refresh` (the rebuild log). All list reads of
 * /offers-data-quality go through `queryGapQueuePage`; writes happen in the
 * nightly rebuild (`gap-queue-snapshot.server.ts`), in
 * `updateGapRecordStatus` and in the on-demand single-item path.
 */

export type GapQueueSnapshotRow = {
  trde_item: string;
  dq_id: number;
  item_name: string;
  brand: string;
  brand_aliases: string[];
  store_bi_names: string[];
  sales_channels: string[];
  item_category: string;
  missing_fields: string;
  status: "open" | "submitted" | "resolved" | "dismissed";
  detected_at: Date;
  channel: string | null;
  category: string | null;
  subcategory: string | null;
  ideal_price: number | null;
  selling_price: number | null;
  fc_perc: number | null;
  fc_eur: number | null;
  mktg_spend: number | null;
  source: string;
  refreshed_at: Date;
};

export type GapQueuePageQuery = {
  /** `undefined` = no brand filter; `[]` = nothing visible. */
  brandAliases: string[] | undefined;
  /** `undefined` = open + submitted. */
  statuses: Array<GapListItem["status"]> | undefined;
  sortBy: GapListSortField;
  sortDir: GapListSortDirection;
  page: number;
  pageSize: number;
  /** Case-insensitive contains-match; `undefined` = no filter. */
  itemName?: string;
  itemCode?: string;
  /** Sales channels the item sold through; `undefined` or `[]` = no filter. */
  channels?: string[];
  /** Stores the item sold at; `undefined` = no filter, `[]` = nothing. */
  stores?: string[];
  /** Inclusive ISO dates (YYYY-MM-DD) on `detected_at`. */
  detectedFrom?: string;
  detectedTo?: string;
};

const ACTIVE_STATUSES: Array<GapListItem["status"]> = ["open", "submitted"];

// Whitelisted ORDER BY expressions — never interpolate user input directly.
const sortExpressions: Record<GapListSortField, Prisma.Sql> = {
  item_name: Prisma.sql`lower(item_name)`,
  brand: Prisma.sql`lower(brand)`,
  item_category: Prisma.sql`lower(item_category)`,
  missing_fields: Prisma.sql`lower(missing_fields)`,
  status: Prisma.sql`CASE status WHEN 'open' THEN 0 WHEN 'submitted' THEN 1 ELSE 2 END`,
  detected_at: Prisma.sql`detected_at`,
};

type PageRow = {
  dq_id: number;
  trde_item: string;
  item_name: string;
  brand: string;
  item_category: string;
  detected_at: Date;
  status: GapListItem["status"];
  missing_fields: string;
};

type CountRow = {
  total_items: number;
  submitted_count: number;
};

function buildBrandClause(brandAliases: string[] | undefined): Prisma.Sql {
  if (brandAliases === undefined) {
    return Prisma.sql`TRUE`;
  }

  const aliases = brandAliases.map((alias) => alias.trim().toLowerCase());

  return Prisma.sql`brand_aliases && ${aliases}::text[]`;
}

function toContainsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, "\\$&")}%`;
}

function buildSearchClause(
  itemName: string | undefined,
  itemCode: string | undefined,
): Prisma.Sql {
  const nameClause = itemName
    ? Prisma.sql`item_name ILIKE ${toContainsPattern(itemName)} ESCAPE '\\'`
    : Prisma.sql`TRUE`;
  const codeClause = itemCode
    ? Prisma.sql`trde_item ILIKE ${toContainsPattern(itemCode)} ESCAPE '\\'`
    : Prisma.sql`TRUE`;

  return Prisma.sql`${nameClause} AND ${codeClause}`;
}

function buildFilterClause(query: GapQueuePageQuery): Prisma.Sql {
  const clauses: Prisma.Sql[] = [Prisma.sql`TRUE`];

  if (query.channels?.length) {
    clauses.push(Prisma.sql`sales_channels && ${query.channels}::text[]`);
  }

  if (query.stores !== undefined) {
    clauses.push(Prisma.sql`store_bi_names && ${query.stores}::text[]`);
  }

  if (query.detectedFrom) {
    clauses.push(Prisma.sql`detected_at >= ${query.detectedFrom}::date`);
  }

  if (query.detectedTo) {
    clauses.push(
      Prisma.sql`detected_at < ${query.detectedTo}::date + interval '1 day'`,
    );
  }

  return Prisma.join(clauses, " AND ");
}

function buildStatusClause(statuses: Array<GapListItem["status"]>): Prisma.Sql {
  return Prisma.sql`status = ANY(${statuses}::text[]::"DqGapStatus"[])`;
}

export async function queryGapQueuePage(
  query: GapQueuePageQuery,
): Promise<GapListPage> {
  const statuses = query.statuses?.length ? query.statuses : ACTIVE_STATUSES;
  const brandClause = buildBrandClause(query.brandAliases);
  const statusClause = buildStatusClause(statuses);
  const searchClause = Prisma.sql`${buildSearchClause(query.itemName, query.itemCode)} AND ${buildFilterClause(query)}`;

  const [counts] = await prisma.$queryRaw<CountRow[]>`
    SELECT
      count(*) FILTER (WHERE ${statusClause})::int AS total_items,
      count(*) FILTER (WHERE status = 'submitted')::int AS submitted_count
    FROM dq_gap_queue_snapshot
    WHERE ${brandClause} AND ${searchClause}
  `;

  const totalItems = counts?.total_items ?? 0;
  const submittedCount = counts?.submitted_count ?? 0;
  const pageSize = Math.max(1, query.pageSize);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, query.page), totalPages);
  const offset = (page - 1) * pageSize;
  const direction =
    query.sortDir === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  const sortExpression = sortExpressions[query.sortBy] ?? sortExpressions.brand;

  const rows =
    totalItems === 0
      ? []
      : await prisma.$queryRaw<PageRow[]>`
          SELECT dq_id, trde_item, item_name, brand, item_category,
                 detected_at, status, missing_fields
          FROM dq_gap_queue_snapshot
          WHERE ${brandClause} AND ${statusClause} AND ${searchClause}
          ORDER BY ${sortExpression} ${direction},
                   lower(brand) ASC, detected_at DESC, lower(item_name) ASC, trde_item ASC
          LIMIT ${pageSize} OFFSET ${offset}
        `;

  return {
    items: rows.map((row) => ({
      dq_id: row.dq_id,
      trde_item: row.trde_item,
      item_name: row.item_name,
      brand: row.brand.toUpperCase(),
      item_category: row.item_category,
      detected_at: row.detected_at.toISOString(),
      status: row.status,
      missing_fields: parseMissingFields(row.missing_fields),
    })),
    totalItems,
    submittedCount,
    page,
    pageSize,
    totalPages,
  };
}

/** Channel and store options for the queue filters, limited to `brandAliases`. */
export async function getGapQueueFilterOptions(
  brandAliases: string[],
): Promise<{ channels: string[]; stores: string[] }> {
  const brandClause = buildBrandClause(brandAliases);
  const [channels, stores] = await Promise.all([
    prisma.$queryRaw<Array<{ value: string }>>`
      SELECT DISTINCT unnest(sales_channels) AS value FROM dq_gap_queue_snapshot
      WHERE ${brandClause}
      ORDER BY value
    `,
    prisma.$queryRaw<Array<{ value: string }>>`
      SELECT DISTINCT unnest(store_bi_names) AS value FROM dq_gap_queue_snapshot
      WHERE ${brandClause}
      ORDER BY value
    `,
  ]);

  return {
    channels: channels.map((row) => row.value),
    stores: stores.map((row) => row.value),
  };
}

export async function getSnapshotRowByItemCode(
  itemCode: string,
): Promise<GapQueueSnapshotRow | null> {
  return prisma.dq_gap_queue_snapshot.findUnique({
    where: {
      trde_item: itemCode,
    },
  });
}

export async function getSnapshotRowByGapId(
  dqId: number,
): Promise<GapQueueSnapshotRow | null> {
  return prisma.dq_gap_queue_snapshot.findUnique({
    where: {
      dq_id: dqId,
    },
  });
}

/** Insert or relink a single snapshot row (on-demand path between rebuilds). */
export async function upsertSnapshotRow(
  row: GapQueueSnapshotRowInput & { dq_id: number; detected_at: Date },
) {
  const data = {
    dq_id: row.dq_id,
    item_name: row.item_name,
    brand: row.brand,
    brand_aliases: row.brand_aliases,
    item_category: row.item_category,
    missing_fields: row.missing_fields,
    status: row.status,
    detected_at: row.detected_at,
    channel: row.current_dim_offers.channel,
    category: row.current_dim_offers.category,
    subcategory: row.current_dim_offers.subcategory,
    ideal_price: row.current_dim_offers.ideal_price,
    selling_price: row.current_dim_offers.selling_price,
    fc_perc: row.current_dim_offers.fc_perc,
    fc_eur: row.current_dim_offers.fc_eur,
    mktg_spend: row.current_dim_offers.mktg_spend,
    source: row.source,
    refreshed_at: new Date(),
  };

  return prisma.dq_gap_queue_snapshot.upsert({
    where: {
      trde_item: row.trde_item,
    },
    create: {
      trde_item: row.trde_item,
      // Create only: on-demand callers do not know the stores, so an update keeps the rebuild's.
      store_bi_names: row.store_bi_names,
      sales_channels: row.sales_channels,
      ...data,
    },
    update: data,
  });
}

export async function getLatestSnapshotRefresh(): Promise<SnapshotRefreshInfo | null> {
  return prisma.dq_gap_queue_refresh.findFirst({
    orderBy: [{ started_at: "desc" }, { id: "desc" }],
  });
}

export async function getLatestSuccessfulSnapshotRefresh(): Promise<SnapshotRefreshInfo | null> {
  return prisma.dq_gap_queue_refresh.findFirst({
    where: {
      status: "succeeded",
    },
    orderBy: [{ finished_at: "desc" }, { id: "desc" }],
  });
}
