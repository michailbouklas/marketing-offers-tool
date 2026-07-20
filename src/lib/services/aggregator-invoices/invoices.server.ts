import { prisma } from "$lib/server/prisma";
import type {
  InvoiceAggregator,
  InvoiceDetail,
  InvoiceFilters,
  InvoiceHeaderRow,
  InvoiceLineRow,
  InvoiceSortDirection,
  InvoiceSortField,
  Paginated,
} from "$lib/services/aggregator-invoices/aggregator-invoices";
import type { Prisma } from "../../../generated/prisma/client";

export type ListInvoicesParams = InvoiceFilters & {
  page: number;
  pageSize: number;
  sortBy: InvoiceSortField;
  sortDir: InvoiceSortDirection;
};

/**
 * Per-aggregator query implementation behind the shared facade. Supporting a
 * new aggregator = one entry in `adapters` mapping its own Prisma models onto
 * the unified row types.
 */
type InvoiceAdapter = {
  listHeaders(params: ListInvoicesParams): Promise<Paginated<InvoiceHeaderRow>>;
  getDetail(documentid: string): Promise<InvoiceDetail | null>;
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

const woltAdapter: InvoiceAdapter = {
  async listHeaders(params) {
    const where = woltWhere(params);

    const [totalItems, rows] = await Promise.all([
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
    ]);

    return toPaginated(
      rows.map((row) => mapWoltHeader(row, row._count.api_WOLT_lines)),
      totalItems,
      params,
    );
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

const boltAdapter: InvoiceAdapter = {
  async listHeaders(params) {
    const where = boltWhere(params);

    const [totalItems, rows] = await Promise.all([
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
    ]);

    return toPaginated(
      rows.map((row) => mapBoltHeader(row, row._count.api_BOLT_lines)),
      totalItems,
      params,
    );
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
};

// --- Facade -----------------------------------------------------------------

const adapters: Record<InvoiceAggregator, InvoiceAdapter> = {
  wolt: woltAdapter,
  bolt: boltAdapter,
};

/** Paginated invoice headers for one aggregator, filtered and sorted. */
export function listInvoiceHeaders(
  params: ListInvoicesParams,
): Promise<Paginated<InvoiceHeaderRow>> {
  return adapters[params.aggregator].listHeaders(params);
}

/** Full invoice (header + ordered lines) or null when unknown. */
export function getInvoiceDetail(
  aggregator: InvoiceAggregator,
  documentid: string,
): Promise<InvoiceDetail | null> {
  return adapters[aggregator].getDetail(documentid);
}
