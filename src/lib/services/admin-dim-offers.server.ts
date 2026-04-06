import { env } from "$env/dynamic/private";
import { clickhouse } from "$lib/server/clickhouse";
import { prisma } from "$lib/server/prisma";
import type {
  AdminDimOfferAuditPageData,
  AdminDimOfferRow,
  AdminDimOffersPage,
  AdminDimOffersSortBy,
  AdminDimOffersSortDir,
} from "$lib/services/admin-dim-offers";
import { listDimOfferAuditEntries } from "$lib/services/dim-offers-audit.server";

type AdminDimOfferQueryRow = {
  item_code?: string | null;
  product_desc?: string | null;
  brand_alias?: string | null;
  channel?: string | null;
  category?: string | null;
  subcategory?: string | null;
  ideal_price?: string | number | null;
  selling_price?: string | number | null;
  fc_perc?: string | number | null;
  mktg_spend?: string | number | null;
  discount_amount?: string | number | null;
  last_changed_at?: string | null;
  last_changed_by?: string | null;
  last_changed_by_name?: string | null;
  last_changed_by_email?: string | null;
};

type CountRow = {
  total: string | number;
};

type ResolvedBrandRow = {
  item_code?: string | null;
  brand_alias?: string | null;
};

type ListAdminDimOffersPageOptions = {
  page: number;
  pageSize: number;
  query?: string | null;
  brandAlias?: string | null;
  sortBy: AdminDimOffersSortBy;
  sortDir: AdminDimOffersSortDir;
};

type ListAdminDimOffersRowsOptions = {
  query?: string | null;
  brandAlias?: string | null;
  sortBy: AdminDimOffersSortBy;
  sortDir: AdminDimOffersSortDir;
  limit?: number;
  offset?: number;
};

function parseNullableNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const parsed = Number.parseFloat(trimmedValue);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseCount(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : 0;
}

function getSortExpression(sortBy: AdminDimOffersSortBy) {
  switch (sortBy) {
    case "item_code":
      return "do.item_code";
    case "product_desc":
      return "ifNull(do.product_desc, '')";
    case "brand_alias":
      return "ifNull(td.resolved_brand, '')";
    case "channel":
      return "ifNull(do.channel, '')";
    case "category":
      return "ifNull(do.category, '')";
    case "subcategory":
      return "ifNull(do.subcategory, '')";
    case "ideal_price":
      return "ifNull(do.ideal_price, -1)";
    case "selling_price":
      return "ifNull(do.selling_price, -1)";
    case "fc_perc":
      return "ifNull(do.fc_perc, -1)";
    case "mktg_spend":
      return "ifNull(do.mktg_spend, -1)";
    case "discount_amount":
      return "ifNull(do.discount_amount, -1)";
  }
}

function buildFilterClauses(query?: string | null, brandAlias?: string | null) {
  return [
    ...(brandAlias ? ["td.resolved_brand = {brand_alias:String}"] : []),
    ...(query
      ? [
          "(positionCaseInsensitiveUTF8(do.item_code, {query:String}) > 0 OR positionCaseInsensitiveUTF8(ifNull(do.product_desc, ''), {query:String}) > 0)",
        ]
      : []),
  ];
}

function buildWhereClause(filterClauses: string[]) {
  return filterClauses.length > 0 ? `WHERE ${filterClauses.join(" AND ")}` : "";
}

function buildBaseQueryParams(
  query?: string | null,
  brandAlias?: string | null,
) {
  return {
    ...(brandAlias ? { brand_alias: brandAlias } : {}),
    ...(query ? { query } : {}),
  };
}

function buildOrderByClause(
  sortBy: AdminDimOffersSortBy,
  sortDir: AdminDimOffersSortDir,
) {
  const sortExpression = getSortExpression(sortBy);
  const sortDirection = sortDir === "desc" ? "DESC" : "ASC";

  if (sortBy === "item_code") {
    return "do.item_code ASC";
  }

  return `isNull(${sortExpression}) ASC, ${sortExpression} ${sortDirection}, do.item_code ASC`;
}

function shouldJoinResolvedBrands(
  sortBy: AdminDimOffersSortBy,
  brandAlias?: string | null,
) {
  return sortBy === "brand_alias" || Boolean(brandAlias);
}

function mapAdminDimOfferRow(row: AdminDimOfferQueryRow): AdminDimOfferRow {
  return {
    item_code: row.item_code ?? "",
    product_desc: row.product_desc ?? null,
    brand_alias: row.brand_alias ?? null,
    channel: row.channel ?? null,
    category: row.category ?? null,
    subcategory: row.subcategory ?? null,
    ideal_price: parseNullableNumber(row.ideal_price),
    selling_price: parseNullableNumber(row.selling_price),
    fc_perc: parseNullableNumber(row.fc_perc),
    mktg_spend: parseNullableNumber(row.mktg_spend),
    discount_amount: parseNullableNumber(row.discount_amount),
    last_changed_at: null,
    last_changed_by: null,
    last_changed_by_name: null,
    last_changed_by_email: null,
  };
}

async function attachLatestAuditSummary(rows: AdminDimOfferRow[]) {
  if (rows.length === 0) {
    return rows;
  }

  const itemCodes = [...new Set(rows.map((row) => row.item_code))];
  const audits = await prisma.dim_offers_audit.findMany({
    where: {
      item_code: {
        in: itemCodes,
      },
    },
    orderBy: [{ changed_at: "desc" }, { id: "desc" }],
    select: {
      item_code: true,
      changed_at: true,
      changed_by: true,
      id: true,
    },
  });

  const actorIds = [
    ...new Set(audits.map((audit) => audit.changed_by.trim()).filter(Boolean)),
  ];
  const actors =
    actorIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: {
            id: {
              in: actorIds,
            },
          },
          select: {
            id: true,
            name: true,
            email: true,
          },
        });

  const actorsById = new Map(actors.map((actor) => [actor.id, actor]));

  const latestAuditByItemCode = new Map<string, (typeof audits)[number]>();

  for (const audit of audits) {
    if (!latestAuditByItemCode.has(audit.item_code)) {
      latestAuditByItemCode.set(audit.item_code, audit);
    }
  }

  return rows.map((row) => {
    const latestAudit = latestAuditByItemCode.get(row.item_code);

    if (!latestAudit) {
      return row;
    }

    const actor = actorsById.get(latestAudit.changed_by);

    return {
      ...row,
      last_changed_at: latestAudit.changed_at.toISOString(),
      last_changed_by: latestAudit.changed_by,
      last_changed_by_name: actor?.name ?? null,
      last_changed_by_email: actor?.email ?? null,
    };
  });
}

async function attachResolvedBrands(rows: AdminDimOfferRow[]) {
  if (rows.length === 0) {
    return rows;
  }

  const itemCodes = [
    ...new Set(rows.map((row) => row.item_code).filter(Boolean)),
  ];

  if (itemCodes.length === 0) {
    return rows;
  }

  const brandsResult = await clickhouse.query({
    query: `
      SELECT
        trde_item AS item_code,
        argMax(brand, trde_date) AS brand_alias
      FROM transaction_details
      WHERE trde_item IN ({item_codes:Array(String)})
        AND trde_item != '-1'
        AND ifNull(brand, '') != ''
      GROUP BY trde_item
    `,
    query_params: {
      item_codes: itemCodes,
    },
    format: "JSONEachRow",
  });
  const brands = await brandsResult.json<ResolvedBrandRow>();
  const brandsByItemCode = new Map(
    brands
      .filter(
        (row) => typeof row.item_code === "string" && row.item_code.length > 0,
      )
      .map((row) => [row.item_code as string, row.brand_alias ?? null]),
  );

  return rows.map((row) => ({
    ...row,
    brand_alias: brandsByItemCode.get(row.item_code) ?? row.brand_alias,
  }));
}

export async function listAdminDimOffersRows({
  query,
  brandAlias,
  sortBy,
  sortDir,
  limit,
  offset,
}: ListAdminDimOffersRowsOptions): Promise<AdminDimOfferRow[]> {
  const filterClauses = buildFilterClauses(query, brandAlias);
  const whereClause = buildWhereClause(filterClauses);
  const orderByClause = buildOrderByClause(sortBy, sortDir);
  const shouldJoinBrands = shouldJoinResolvedBrands(sortBy, brandAlias);
  const rowsResult = await clickhouse.query({
    query: `
      SELECT
        do.item_code,
        do.product_desc,
        ${shouldJoinBrands ? "td.resolved_brand AS brand_alias," : ""}
        do.channel,
        do.category,
        do.subcategory,
        do.ideal_price,
        do.selling_price,
        do.fc_perc,
        do.mktg_spend,
        do.discount_amount
      FROM dim_offers do
      ${
        shouldJoinBrands
          ? `LEFT JOIN (
        SELECT
          trde_item,
          argMax(brand, trde_date) AS resolved_brand
        FROM transaction_details
        WHERE trde_item != '-1'
          AND ifNull(brand, '') != ''
        GROUP BY trde_item
      ) td ON td.trde_item = do.item_code`
          : ""
      }
      ${whereClause}
      ORDER BY ${orderByClause}
      ${limit !== undefined ? "LIMIT {limit:UInt32}" : ""}
      ${offset !== undefined ? "OFFSET {offset:UInt32}" : ""}
    `,
    query_params: {
      ...buildBaseQueryParams(query, brandAlias),
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {}),
    },
    format: "JSONEachRow",
  });
  const rows = (await rowsResult.json<AdminDimOfferQueryRow>()).map(
    mapAdminDimOfferRow,
  );

  if (shouldJoinBrands) {
    return attachLatestAuditSummary(rows);
  }

  const [rowsWithBrands, rowsWithAudit] = await Promise.all([
    attachResolvedBrands(rows),
    attachLatestAuditSummary(rows),
  ]);
  const auditByItemCode = new Map(
    rowsWithAudit.map((row) => [row.item_code, row]),
  );

  return rowsWithBrands.map((row) => {
    const auditRow = auditByItemCode.get(row.item_code);

    if (!auditRow) {
      return row;
    }

    return {
      ...row,
      last_changed_at: auditRow.last_changed_at,
      last_changed_by: auditRow.last_changed_by,
      last_changed_by_name: auditRow.last_changed_by_name,
      last_changed_by_email: auditRow.last_changed_by_email,
    };
  });
}

export async function listAdminDimOffersPage({
  page,
  pageSize,
  query,
  brandAlias,
  sortBy,
  sortDir,
}: ListAdminDimOffersPageOptions): Promise<AdminDimOffersPage> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.trunc(pageSize) : 50;
  const filterClauses = buildFilterClauses(query, brandAlias);
  const whereClause = buildWhereClause(filterClauses);
  const baseQueryParams = buildBaseQueryParams(query, brandAlias);
  const shouldJoinBrands = shouldJoinResolvedBrands(sortBy, brandAlias);

  const countResult = await clickhouse.query({
    query: `
      SELECT count() AS total
      FROM dim_offers do
      ${
        shouldJoinBrands
          ? `LEFT JOIN (
        SELECT
          trde_item,
          argMax(brand, trde_date) AS resolved_brand
        FROM transaction_details
        WHERE trde_item != '-1'
          AND ifNull(brand, '') != ''
        GROUP BY trde_item
      ) td ON td.trde_item = do.item_code`
          : ""
      }
      ${whereClause}
    `,
    query_params: baseQueryParams,
    format: "JSONEachRow",
  });

  const countRows = await countResult.json<CountRow>();
  const totalItems = parseCount(countRows[0]?.total);
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const effectivePage = Math.min(safePage, totalPages);
  const offset = (effectivePage - 1) * safePageSize;
  const rows = await listAdminDimOffersRows({
    query,
    brandAlias,
    sortBy,
    sortDir,
    limit: safePageSize,
    offset,
  });

  return {
    items: rows,
    page: effectivePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
  };
}

export async function getAdminDimOfferAuditPageData(
  itemCode: string,
): Promise<AdminDimOfferAuditPageData> {
  const [itemRows, audits] = await Promise.all([
    listAdminDimOffersRows({
      query: itemCode,
      sortBy: "item_code",
      sortDir: "asc",
      limit: 200,
    }),
    listDimOfferAuditEntries(itemCode),
  ]);

  const item = itemRows.find((row) => row.item_code === itemCode) ?? null;

  return {
    item,
    audits,
  };
}
