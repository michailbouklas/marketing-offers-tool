import { prisma } from "$lib/server/prisma";
import type {
  InvoiceAggregator,
  InvoiceDetail,
  InvoiceFilters,
  InvoiceHeaderRow,
  InvoiceHeadersPage,
  InvoiceLineRow,
  InvoiceMetrics,
  InvoicePayoutTrend,
  InvoicePayoutTrendPoint,
  InvoiceSortDirection,
  InvoiceSortField,
  InvoiceTrend,
  Paginated,
  StoreInvoiceMetrics,
} from "$lib/services/aggregator-invoices/aggregator-invoices";
import type { Prisma } from "../../../generated/prisma/client";

export type ListInvoicesParams = InvoiceFilters & {
  page: number;
  pageSize: number;
  sortBy: InvoiceSortField;
  sortDir: InvoiceSortDirection;
};

export type StoreInvoiceMetricsParams = Pick<
  InvoiceFilters,
  "aggregator" | "from" | "to"
> & {
  storeName: string | null;
  bpname: string | null;
};

/**
 * Per-aggregator query implementation behind the shared facade. Supporting a
 * new aggregator = one entry in `adapters` mapping its own Prisma models onto
 * the unified row types.
 */
type InvoiceAdapter = {
  listHeaders(params: ListInvoicesParams): Promise<InvoiceHeadersPage>;
  getDetail(documentid: string): Promise<InvoiceDetail | null>;
  getTrend(filters: InvoiceFilters): Promise<InvoiceTrend>;
  getMetrics(filters: InvoiceFilters): Promise<InvoiceMetrics>;
};

/** Coerce Prisma Decimal (or any numeric-ish value) to a serializable number. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** `where.documentdate` fragment for the filter's inclusive date range. */
function documentDateRange(filters: {
  from: string | null;
  to: string | null;
}): { gte?: Date; lt?: Date } | undefined {
  const range: { gte?: Date; lt?: Date } = {};

  if (filters.from) {
    range.gte = new Date(`${filters.from}T00:00:00Z`);
  }

  if (filters.to) {
    const upper = new Date(`${filters.to}T00:00:00Z`);
    upper.setUTCDate(upper.getUTCDate() + 1);
    range.lt = upper;
  }

  return range.gte === undefined && range.lt === undefined ? undefined : range;
}

/** Both header models share the sortable columns, so one orderBy fits all. */
function orderByFor(sortBy: InvoiceSortField, sortDir: InvoiceSortDirection) {
  if (sortBy === "totalpayout") {
    return [
      { totalpayout: { sort: sortDir, nulls: "last" as const } },
      { documentdate: { sort: "desc" as const, nulls: "last" as const } },
    ];
  }

  return [
    { documentdate: { sort: sortDir, nulls: "last" as const } },
    { createdat: "desc" as const },
  ];
}

function toPaginated<T>(
  items: T[],
  totalItems: number,
  params: ListInvoicesParams,
): Paginated<T> {
  return {
    items,
    page: params.page,
    pageSize: params.pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / params.pageSize)),
  };
}

type TrendHeaderRow = { documentid: string; documentdate: Date | null };

type TrendLineSum = {
  documentid: string | null;
  transtype: string | null;
  totalamount: number | null;
};

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Buckets per-invoice line sums into per-day points, one series per
 * transaction type. Days come from the header `documentdate` (UTC); headers
 * without a date are skipped. Series are ordered by total absolute volume so
 * the largest types get the first palette colors.
 */
function buildInvoiceTrend(
  headers: TrendHeaderRow[],
  lineSums: TrendLineSum[],
): InvoiceTrend {
  const dayByDocument = new Map<string, string>();
  for (const header of headers) {
    if (header.documentdate) {
      dayByDocument.set(
        header.documentid,
        header.documentdate.toISOString().slice(0, 10),
      );
    }
  }

  const byType = new Map<
    string,
    { volume: number; byDay: Map<string, number> }
  >();
  for (const line of lineSums) {
    const day = line.documentid
      ? dayByDocument.get(line.documentid)
      : undefined;
    if (!day || line.totalamount === null) {
      continue;
    }

    const label = line.transtype?.trim() || "Unknown";
    let bucket = byType.get(label);
    if (!bucket) {
      bucket = { volume: 0, byDay: new Map() };
      byType.set(label, bucket);
    }
    bucket.volume += Math.abs(line.totalamount);
    bucket.byDay.set(day, (bucket.byDay.get(day) ?? 0) + line.totalamount);
  }

  const ordered = [...byType.entries()].sort(
    (left, right) => right[1].volume - left[1].volume,
  );
  const series = ordered.map(([label], index) => ({
    key: `t${index}`,
    label,
  }));

  const days = [
    ...new Set(ordered.flatMap(([, bucket]) => [...bucket.byDay.keys()])),
  ].sort();
  const points = days.map((day) => {
    const values: Record<string, number> = {};
    ordered.forEach(([, bucket], index) => {
      values[`t${index}`] = roundAmount(bucket.byDay.get(day) ?? 0);
    });
    return { day, values };
  });

  return { series, points };
}

/**
 * Buckets header dates + payouts over time. Monthly when the data spans at
 * least two months; daily otherwise so a short period filter (e.g. a single
 * month) still gets a usable trend. Months without invoices between the
 * first and last are zero-filled; daily points only include actual issuance
 * dates (invoices arrive in multi-day batches, so zero-filling every
 * calendar day would render a misleading sawtooth). Headers without a
 * `documentdate` are skipped.
 */
function buildPayoutTrend(
  rows: { documentdate: Date | null; totalpayout: unknown }[],
): InvoicePayoutTrend {
  const dated = rows.filter(
    (row): row is { documentdate: Date; totalpayout: unknown } =>
      row.documentdate !== null,
  );

  const monthCount = new Set(
    dated.map((row) => row.documentdate.toISOString().slice(0, 7)),
  ).size;
  const granularity: InvoicePayoutTrend["granularity"] =
    monthCount >= 2 ? "month" : "day";
  const keyLength = granularity === "month" ? 7 : 10;

  const byBucket = new Map<
    string,
    { invoiceCount: number; totalPayout: number }
  >();
  for (const row of dated) {
    const key = row.documentdate.toISOString().slice(0, keyLength);
    const bucket = byBucket.get(key) ?? { invoiceCount: 0, totalPayout: 0 };
    bucket.invoiceCount += 1;
    bucket.totalPayout += toNumber(row.totalpayout) ?? 0;
    byBucket.set(key, bucket);
  }

  if (byBucket.size === 0) {
    return { granularity, points: [] };
  }

  const keys = [...byBucket.keys()].sort();

  if (granularity === "day") {
    return {
      granularity,
      points: keys.map((key) => {
        const bucket = byBucket.get(key)!;
        return {
          period: key,
          invoiceCount: bucket.invoiceCount,
          totalPayout: roundAmount(bucket.totalPayout),
        };
      }),
    };
  }

  const last = keys[keys.length - 1];
  const cursor = new Date(`${keys[0]}-01T00:00:00Z`);
  const points: InvoicePayoutTrendPoint[] = [];

  while (true) {
    const key = cursor.toISOString().slice(0, keyLength);
    const bucket = byBucket.get(key) ?? { invoiceCount: 0, totalPayout: 0 };
    points.push({
      period: cursor.toISOString().slice(0, 10),
      invoiceCount: bucket.invoiceCount,
      totalPayout: roundAmount(bucket.totalPayout),
    });

    if (key === last) {
      return { granularity, points };
    }

    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
}

/** Shapes header totals + per-transtype line sums into `InvoiceMetrics`. */
function toInvoiceMetrics(
  invoiceCount: number,
  totalInvoiceAmount: number,
  transactionTypes: {
    transtype: string | null;
    lineItemCount: number;
    totalAmount: number;
  }[],
  monthlyRows: { documentdate: Date | null; totalpayout: unknown }[],
): InvoiceMetrics {
  const metrics = transactionTypes
    .map((row) => ({
      transactionType: row.transtype,
      lineItemCount: row.lineItemCount,
      totalAmount: row.totalAmount,
    }))
    .sort((left, right) =>
      (left.transactionType ?? "").localeCompare(right.transactionType ?? ""),
    );

  return {
    invoiceCount,
    lineItemCount: metrics.reduce(
      (total, metric) => total + metric.lineItemCount,
      0,
    ),
    totalInvoiceAmount,
    transactionTypes: metrics,
    payoutTrend: buildPayoutTrend(monthlyRows),
  };
}

// --- Wolt -------------------------------------------------------------------

const woltHeaderSelect = {
  documentid: true,
  documentdate: true,
  invoicenumber: true,
  timeframe: true,
  remarks: true,
  bpcode: true,
  bpname: true,
  partnername: true,
  distributionrule: true,
  project: true,
  erpdatabase: true,
  createdat: true,
  erpsent: true,
  erpcreatedat: true,
  totalpayout: true,
} satisfies Prisma.api_WOLT_headerSelect;

type WoltHeaderPayload = Prisma.api_WOLT_headerGetPayload<{
  select: typeof woltHeaderSelect;
}>;

const woltLineSelect = {
  documentid: true,
  linenumber: true,
  transtype: true,
  linedetails: true,
  amount: true,
  vatamount: true,
  totalamount: true,
  accountcode: true,
  vatcode: true,
} satisfies Prisma.api_WOLT_linesSelect;

type WoltLinePayload = Prisma.api_WOLT_linesGetPayload<{
  select: typeof woltLineSelect;
}>;

function woltWhere(filters: InvoiceFilters): Prisma.api_WOLT_headerWhereInput {
  const range = documentDateRange(filters);

  return {
    ...(filters.invoiceNumber
      ? {
          invoicenumber: {
            contains: filters.invoiceNumber,
            mode: "insensitive" as const,
          },
        }
      : {}),
    ...(filters.store
      ? {
          OR: [
            {
              bpname: { contains: filters.store, mode: "insensitive" as const },
            },
            {
              partnername: {
                contains: filters.store,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
    ...(filters.erpsent ? { erpsent: filters.erpsent } : {}),
    ...(range ? { documentdate: range } : {}),
    ...(filters.projectCodes ? { project: { in: filters.projectCodes } } : {}),
    ...(filters.lineDetails
      ? {
          api_WOLT_lines: {
            some: {
              linedetails: {
                contains: filters.lineDetails,
                mode: "insensitive" as const,
              },
            },
          },
        }
      : {}),
  };
}

function mapWoltHeader(
  row: WoltHeaderPayload,
  lineCount: number,
): InvoiceHeaderRow {
  return {
    aggregator: "wolt",
    documentid: row.documentid,
    documentdate: row.documentdate?.toISOString() ?? null,
    invoicenumber: row.invoicenumber,
    timeframe: row.timeframe,
    bpcode: row.bpcode,
    bpname: row.bpname,
    storeName: row.partnername,
    distributionrule: row.distributionrule,
    project: row.project,
    erpdatabase: row.erpdatabase,
    totalpayout: toNumber(row.totalpayout),
    createdat: row.createdat.toISOString(),
    erpsent: row.erpsent,
    erpcreatedat: row.erpcreatedat?.toISOString() ?? null,
    lineCount,
    extraFields: row.remarks ? [{ label: "Remarks", value: row.remarks }] : [],
  };
}

function mapWoltLine(row: WoltLinePayload): InvoiceLineRow {
  return {
    documentid: row.documentid,
    linenumber: row.linenumber,
    jeNumber: null,
    transtype: row.transtype,
    linedetails: row.linedetails,
    amount: toNumber(row.amount),
    vatamount: toNumber(row.vatamount),
    totalamount: toNumber(row.totalamount),
    accountcode: row.accountcode,
    vatcode: row.vatcode,
  };
}

function woltStoreWhere(
  params: StoreInvoiceMetricsParams,
): Prisma.api_WOLT_headerWhereInput {
  const range = documentDateRange(params);

  return {
    ...(params.storeName
      ? { partnername: params.storeName }
      : { partnername: null, bpname: params.bpname }),
    ...(range ? { documentdate: range } : {}),
  };
}

async function getWoltStoreMetrics(
  params: StoreInvoiceMetricsParams,
): Promise<StoreInvoiceMetrics> {
  const where = woltStoreWhere(params);
  const [invoiceTotals, transactionTypes, lineDetails] = await Promise.all([
    prisma.api_WOLT_header.aggregate({
      where,
      _count: { _all: true },
      _sum: { totalpayout: true },
    }),
    prisma.api_WOLT_lines.groupBy({
      by: ["transtype"],
      where: { api_WOLT_header: where },
      _count: { _all: true },
      _sum: { totalamount: true },
    }),
    prisma.api_WOLT_lines.groupBy({
      by: ["linedetails"],
      where: { api_WOLT_header: where },
      _count: { _all: true },
      _sum: { totalamount: true },
    }),
  ]);

  const metrics = transactionTypes
    .map((row) => ({
      transactionType: row.transtype,
      lineItemCount: row._count._all,
      totalAmount: toNumber(row._sum.totalamount) ?? 0,
    }))
    .sort((left, right) =>
      (left.transactionType ?? "").localeCompare(right.transactionType ?? ""),
    );

  return {
    invoiceCount: invoiceTotals._count._all,
    lineItemCount: metrics.reduce(
      (total, metric) => total + metric.lineItemCount,
      0,
    ),
    totalInvoiceAmount: toNumber(invoiceTotals._sum.totalpayout) ?? 0,
    transactionTypes: metrics,
    lineDetails: lineDetails
      .map((row) => ({
        lineDetails: row.linedetails,
        lineItemCount: row._count._all,
        totalAmount: toNumber(row._sum.totalamount) ?? 0,
      }))
      .sort((left, right) =>
        (left.lineDetails ?? "").localeCompare(right.lineDetails ?? ""),
      ),
  };
}

const woltAdapter: InvoiceAdapter = {
  async listHeaders(params) {
    const where = woltWhere(params);

    const [totalItems, rows, payoutSum] = await Promise.all([
      prisma.api_WOLT_header.count({ where }),
      prisma.api_WOLT_header.findMany({
        where,
        orderBy: orderByFor(params.sortBy, params.sortDir),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: {
          ...woltHeaderSelect,
          _count: { select: { api_WOLT_lines: true } },
        },
      }),
      prisma.api_WOLT_header.aggregate({
        where,
        _sum: { totalpayout: true },
      }),
    ]);

    return {
      ...toPaginated(
        rows.map((row) => mapWoltHeader(row, row._count.api_WOLT_lines)),
        totalItems,
        params,
      ),
      totalPayout: toNumber(payoutSum._sum.totalpayout),
    };
  },

  async getDetail(documentid) {
    const row = await prisma.api_WOLT_header.findUnique({
      where: { documentid },
      select: {
        ...woltHeaderSelect,
        api_WOLT_lines: {
          orderBy: { linenumber: "asc" },
          select: woltLineSelect,
        },
      },
    });

    if (!row) {
      return null;
    }

    return {
      header: mapWoltHeader(row, row.api_WOLT_lines.length),
      lines: row.api_WOLT_lines.map(mapWoltLine),
    };
  },

  async getTrend(filters) {
    const where = woltWhere(filters);

    const [headers, lineSums] = await Promise.all([
      prisma.api_WOLT_header.findMany({
        where,
        select: { documentid: true, documentdate: true },
      }),
      prisma.api_WOLT_lines.groupBy({
        by: ["documentid", "transtype"],
        where: { api_WOLT_header: where },
        _sum: { totalamount: true },
      }),
    ]);

    return buildInvoiceTrend(
      headers,
      lineSums.map((row) => ({
        documentid: row.documentid,
        transtype: row.transtype,
        totalamount: toNumber(row._sum.totalamount),
      })),
    );
  },

  async getMetrics(filters) {
    const where = woltWhere(filters);

    const [invoiceTotals, transactionTypes, monthlyRows] = await Promise.all([
      prisma.api_WOLT_header.aggregate({
        where,
        _count: { _all: true },
        _sum: { totalpayout: true },
      }),
      prisma.api_WOLT_lines.groupBy({
        by: ["transtype"],
        where: { api_WOLT_header: where },
        _count: { _all: true },
        _sum: { totalamount: true },
      }),
      prisma.api_WOLT_header.findMany({
        where,
        select: { documentdate: true, totalpayout: true },
      }),
    ]);

    return toInvoiceMetrics(
      invoiceTotals._count._all,
      toNumber(invoiceTotals._sum.totalpayout) ?? 0,
      transactionTypes.map((row) => ({
        transtype: row.transtype,
        lineItemCount: row._count._all,
        totalAmount: toNumber(row._sum.totalamount) ?? 0,
      })),
      monthlyRows,
    );
  },
};

// --- Bolt -------------------------------------------------------------------

const boltHeaderSelect = {
  documentid: true,
  documentdate: true,
  invoicenumber: true,
  timeframe: true,
  scenario: true,
  je1_date: true,
  je2_date: true,
  bpcode: true,
  bpname: true,
  bolt_storename: true,
  distributionrule: true,
  project: true,
  erpdatabase: true,
  totalpayout: true,
  createdat: true,
  erpsent: true,
  erpcreatedat: true,
  erpcomments: true,
} satisfies Prisma.api_BOLT_headerSelect;

type BoltHeaderPayload = Prisma.api_BOLT_headerGetPayload<{
  select: typeof boltHeaderSelect;
}>;

const boltLineSelect = {
  documentid: true,
  linenumber: true,
  je_number: true,
  transtype: true,
  linedetails: true,
  amount: true,
  vatamount: true,
  totalamount: true,
  accountcode: true,
  vatcode: true,
} satisfies Prisma.api_BOLT_linesSelect;

type BoltLinePayload = Prisma.api_BOLT_linesGetPayload<{
  select: typeof boltLineSelect;
}>;

function boltWhere(filters: InvoiceFilters): Prisma.api_BOLT_headerWhereInput {
  const range = documentDateRange(filters);

  return {
    ...(filters.invoiceNumber
      ? {
          invoicenumber: {
            contains: filters.invoiceNumber,
            mode: "insensitive" as const,
          },
        }
      : {}),
    ...(filters.store
      ? {
          OR: [
            {
              bpname: { contains: filters.store, mode: "insensitive" as const },
            },
            {
              bolt_storename: {
                contains: filters.store,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
    ...(filters.erpsent ? { erpsent: filters.erpsent } : {}),
    ...(range ? { documentdate: range } : {}),
    ...(filters.projectCodes ? { project: { in: filters.projectCodes } } : {}),
    ...(filters.lineDetails
      ? {
          api_BOLT_lines: {
            some: {
              linedetails: {
                contains: filters.lineDetails,
                mode: "insensitive" as const,
              },
            },
          },
        }
      : {}),
  };
}

function boltExtraFields(
  row: BoltHeaderPayload,
): { label: string; value: string }[] {
  const fields = [{ label: "Scenario", value: String(row.scenario) }];

  if (row.je1_date) {
    fields.push({
      label: "JE1 date",
      value: row.je1_date.toISOString().slice(0, 10),
    });
  }

  if (row.je2_date) {
    fields.push({
      label: "JE2 date",
      value: row.je2_date.toISOString().slice(0, 10),
    });
  }

  if (row.erpcomments) {
    fields.push({ label: "ERP comments", value: row.erpcomments });
  }

  return fields;
}

function mapBoltHeader(
  row: BoltHeaderPayload,
  lineCount: number,
): InvoiceHeaderRow {
  return {
    aggregator: "bolt",
    documentid: row.documentid,
    documentdate: row.documentdate?.toISOString() ?? null,
    invoicenumber: row.invoicenumber,
    timeframe: row.timeframe,
    bpcode: row.bpcode,
    bpname: row.bpname,
    storeName: row.bolt_storename,
    distributionrule: row.distributionrule,
    project: row.project,
    erpdatabase: row.erpdatabase,
    totalpayout: toNumber(row.totalpayout),
    createdat: row.createdat?.toISOString() ?? null,
    erpsent: row.erpsent,
    erpcreatedat: row.erpcreatedat?.toISOString() ?? null,
    lineCount,
    extraFields: boltExtraFields(row),
  };
}

function mapBoltLine(row: BoltLinePayload): InvoiceLineRow {
  return {
    documentid: row.documentid,
    linenumber: row.linenumber,
    jeNumber: row.je_number,
    transtype: row.transtype,
    linedetails: row.linedetails,
    amount: toNumber(row.amount),
    vatamount: toNumber(row.vatamount),
    totalamount: toNumber(row.totalamount),
    accountcode: row.accountcode,
    vatcode: row.vatcode,
  };
}

function boltStoreWhere(
  params: StoreInvoiceMetricsParams,
): Prisma.api_BOLT_headerWhereInput {
  const range = documentDateRange(params);

  return {
    ...(params.storeName
      ? { bolt_storename: params.storeName }
      : { bolt_storename: null, bpname: params.bpname }),
    ...(range ? { documentdate: range } : {}),
  };
}

async function getBoltStoreMetrics(
  params: StoreInvoiceMetricsParams,
): Promise<StoreInvoiceMetrics> {
  const where = boltStoreWhere(params);
  const [invoiceTotals, transactionTypes, lineDetails] = await Promise.all([
    prisma.api_BOLT_header.aggregate({
      where,
      _count: { _all: true },
      _sum: { totalpayout: true },
    }),
    prisma.api_BOLT_lines.groupBy({
      by: ["transtype"],
      where: { api_BOLT_header: where },
      _count: { _all: true },
      _sum: { totalamount: true },
    }),
    prisma.api_BOLT_lines.groupBy({
      by: ["linedetails"],
      where: { api_BOLT_header: where },
      _count: { _all: true },
      _sum: { totalamount: true },
    }),
  ]);

  const metrics = transactionTypes
    .map((row) => ({
      transactionType: row.transtype,
      lineItemCount: row._count._all,
      totalAmount: toNumber(row._sum.totalamount) ?? 0,
    }))
    .sort((left, right) =>
      (left.transactionType ?? "").localeCompare(right.transactionType ?? ""),
    );

  return {
    invoiceCount: invoiceTotals._count._all,
    lineItemCount: metrics.reduce(
      (total, metric) => total + metric.lineItemCount,
      0,
    ),
    totalInvoiceAmount: toNumber(invoiceTotals._sum.totalpayout) ?? 0,
    transactionTypes: metrics,
    lineDetails: lineDetails
      .map((row) => ({
        lineDetails: row.linedetails,
        lineItemCount: row._count._all,
        totalAmount: toNumber(row._sum.totalamount) ?? 0,
      }))
      .sort((left, right) =>
        (left.lineDetails ?? "").localeCompare(right.lineDetails ?? ""),
      ),
  };
}

const boltAdapter: InvoiceAdapter = {
  async listHeaders(params) {
    const where = boltWhere(params);

    const [totalItems, rows, payoutSum] = await Promise.all([
      prisma.api_BOLT_header.count({ where }),
      prisma.api_BOLT_header.findMany({
        where,
        orderBy: orderByFor(params.sortBy, params.sortDir),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: {
          ...boltHeaderSelect,
          _count: { select: { api_BOLT_lines: true } },
        },
      }),
      prisma.api_BOLT_header.aggregate({
        where,
        _sum: { totalpayout: true },
      }),
    ]);

    return {
      ...toPaginated(
        rows.map((row) => mapBoltHeader(row, row._count.api_BOLT_lines)),
        totalItems,
        params,
      ),
      totalPayout: toNumber(payoutSum._sum.totalpayout),
    };
  },

  async getDetail(documentid) {
    const row = await prisma.api_BOLT_header.findUnique({
      where: { documentid },
      select: {
        ...boltHeaderSelect,
        api_BOLT_lines: {
          orderBy: [{ je_number: "asc" }, { linenumber: "asc" }],
          select: boltLineSelect,
        },
      },
    });

    if (!row) {
      return null;
    }

    return {
      header: mapBoltHeader(row, row.api_BOLT_lines.length),
      lines: row.api_BOLT_lines.map(mapBoltLine),
    };
  },

  async getTrend(filters) {
    const where = boltWhere(filters);

    const [headers, lineSums] = await Promise.all([
      prisma.api_BOLT_header.findMany({
        where,
        select: { documentid: true, documentdate: true },
      }),
      prisma.api_BOLT_lines.groupBy({
        by: ["documentid", "transtype"],
        where: { api_BOLT_header: where },
        _sum: { totalamount: true },
      }),
    ]);

    return buildInvoiceTrend(
      headers,
      lineSums.map((row) => ({
        documentid: row.documentid,
        transtype: row.transtype,
        totalamount: toNumber(row._sum.totalamount),
      })),
    );
  },

  async getMetrics(filters) {
    const where = boltWhere(filters);

    const [invoiceTotals, transactionTypes, monthlyRows] = await Promise.all([
      prisma.api_BOLT_header.aggregate({
        where,
        _count: { _all: true },
        _sum: { totalpayout: true },
      }),
      prisma.api_BOLT_lines.groupBy({
        by: ["transtype"],
        where: { api_BOLT_header: where },
        _count: { _all: true },
        _sum: { totalamount: true },
      }),
      prisma.api_BOLT_header.findMany({
        where,
        select: { documentdate: true, totalpayout: true },
      }),
    ]);

    return toInvoiceMetrics(
      invoiceTotals._count._all,
      toNumber(invoiceTotals._sum.totalpayout) ?? 0,
      transactionTypes.map((row) => ({
        transtype: row.transtype,
        lineItemCount: row._count._all,
        totalAmount: toNumber(row._sum.totalamount) ?? 0,
      })),
      monthlyRows,
    );
  },
};

// --- Facade -----------------------------------------------------------------

const adapters: Record<InvoiceAggregator, InvoiceAdapter> = {
  wolt: woltAdapter,
  bolt: boltAdapter,
};

/** Paginated invoice headers for one aggregator, filtered and sorted. */
export function listInvoiceHeaders(
  params: ListInvoicesParams,
): Promise<InvoiceHeadersPage> {
  return adapters[params.aggregator].listHeaders(params);
}

/** Full invoice (header + ordered lines) or null when unknown. */
export function getInvoiceDetail(
  aggregator: InvoiceAggregator,
  documentid: string,
): Promise<InvoiceDetail | null> {
  return adapters[aggregator].getDetail(documentid);
}

/** Per-day line totals per transaction type across ALL matching invoices. */
export function getInvoiceTrend(
  filters: InvoiceFilters,
): Promise<InvoiceTrend> {
  return adapters[filters.aggregator].getTrend(filters);
}

/** Headline totals + transaction-type breakdown across ALL matching invoices. */
export function getInvoiceMetrics(
  filters: InvoiceFilters,
): Promise<InvoiceMetrics> {
  return adapters[filters.aggregator].getMetrics(filters);
}

/** Store totals and transaction-type line breakdown for the selected period. */
export function getStoreInvoiceMetrics(
  params: StoreInvoiceMetricsParams,
): Promise<StoreInvoiceMetrics> {
  return params.aggregator === "wolt"
    ? getWoltStoreMetrics(params)
    : getBoltStoreMetrics(params);
}
