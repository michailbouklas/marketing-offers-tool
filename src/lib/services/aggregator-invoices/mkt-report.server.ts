import { prisma } from "$lib/server/prisma";
import type { InvoiceAggregator } from "$lib/services/aggregator-invoices/aggregator-invoices";
import {
  MKT_TRANSTYPES,
  type MktReportParams,
  type MktReportRow,
} from "$lib/services/aggregator-invoices/mkt-report";
import { Prisma } from "../../../generated/prisma/client";

export type MktReportFilters = Omit<MktReportParams, "brands" | "view"> & {
  /** Union of the selected brands' project codes; null = no brand filter. */
  projectCodes: string[] | null;
};

const SOURCES: Record<
  InvoiceAggregator,
  { header: Prisma.Sql; lines: Prisma.Sql; store: Prisma.Sql }
> = {
  wolt: {
    header: Prisma.raw(`"api_WOLT_header"`),
    lines: Prisma.raw(`"api_WOLT_lines"`),
    store: Prisma.raw(`coalesce(h.partnername, h.bpname)`),
  },
  bolt: {
    header: Prisma.raw(`"api_BOLT_header"`),
    lines: Prisma.raw(`"api_BOLT_lines"`),
    store: Prisma.raw(`coalesce(h.bolt_storename, h.bpname)`),
  },
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

function selected(aggregators: InvoiceAggregator[]): InvoiceAggregator[] {
  return aggregators.length > 0 ? aggregators : ["wolt", "bolt"];
}

/** Header-level WHERE for one aggregator (alias `h`). */
function headerWhere(
  aggregator: InvoiceAggregator,
  filters: Pick<
    MktReportFilters,
    "projectCodes" | "stores" | "invoiceNumber" | "from" | "to"
  >,
): Prisma.Sql {
  const store = SOURCES[aggregator].store;
  const clauses: Prisma.Sql[] = [Prisma.sql`h.documentdate IS NOT NULL`];
  if (filters.projectCodes) {
    clauses.push(
      Prisma.sql`h.project IN (${Prisma.join(filters.projectCodes)})`,
    );
  }
  if (filters.stores.length > 0) {
    clauses.push(Prisma.sql`${store} IN (${Prisma.join(filters.stores)})`);
  }
  if (filters.invoiceNumber) {
    clauses.push(
      Prisma.sql`h.invoicenumber ILIKE ${`%${escapeLike(filters.invoiceNumber)}%`}`,
    );
  }
  if (filters.from) {
    clauses.push(Prisma.sql`h.documentdate >= ${filters.from}::date`);
  }
  if (filters.to) {
    // Inclusive day: everything before the next midnight.
    clauses.push(
      Prisma.sql`h.documentdate < ${filters.to}::date + interval '1 day'`,
    );
  }
  return Prisma.join(clauses, " AND ");
}

type RawRow = {
  aggregator: InvoiceAggregator;
  store: string;
  month: string;
  net: unknown;
  vat: unknown;
  gross: unknown;
  delivery_gross: unknown;
  lines: unknown;
  invoices: unknown;
  sales_gross: unknown;
};

const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Marketing line totals per (aggregator, store, month). Only invoices with at
 * least one matching marketing line count; the line-details search narrows
 * the marketing lines themselves (not "any line on the invoice" like the
 * invoices list). Sales (SAL) come from those same invoices.
 */
export async function getMktReportRows(
  filters: MktReportFilters,
): Promise<MktReportRow[]> {
  // A picked brand without project codes intentionally matches nothing.
  if (filters.projectCodes?.length === 0) return [];

  const lineMatch = filters.lineDetails
    ? Prisma.sql`l.linedetails ILIKE ${`%${escapeLike(filters.lineDetails)}%`}`
    : Prisma.sql`TRUE`;

  const parts = selected(filters.aggregators).map((aggregator) => {
    const { header, lines, store } = SOURCES[aggregator];
    const mktTypes = Prisma.join(MKT_TRANSTYPES[aggregator]);
    return Prisma.sql`
      SELECT ${aggregator}::text AS aggregator,
             ${store} AS store,
             to_char(h.documentdate, 'YYYY-MM') AS month,
             h.documentid,
             trim(l.transtype) AS transtype,
             (trim(l.transtype) IN (${mktTypes}) AND ${lineMatch}) AS is_mkt,
             l.amount, l.vatamount, l.totalamount
      FROM ${lines} l
      JOIN ${header} h ON h.documentid = l.documentid
      WHERE ${headerWhere(aggregator, filters)}
        AND trim(l.transtype) IN (${mktTypes}, 'SAL')`;
  });

  const rows = await prisma.$queryRaw<RawRow[]>`
    WITH tagged AS (${Prisma.join(parts, " UNION ALL ")}),
    mkt_docs AS (
      SELECT DISTINCT aggregator, documentid FROM tagged WHERE is_mkt
    )
    SELECT t.aggregator,
           coalesce(t.store, '(no store)') AS store,
           t.month,
           sum(t.amount) FILTER (WHERE t.is_mkt) AS net,
           sum(t.vatamount) FILTER (WHERE t.is_mkt) AS vat,
           sum(t.totalamount) FILTER (WHERE t.is_mkt) AS gross,
           sum(t.totalamount) FILTER (WHERE t.is_mkt AND t.transtype = 'MKT_DEL') AS delivery_gross,
           count(*) FILTER (WHERE t.is_mkt) AS lines,
           count(DISTINCT t.documentid) AS invoices,
           sum(t.totalamount) FILTER (WHERE t.transtype = 'SAL') AS sales_gross
    FROM tagged t
    JOIN mkt_docs d USING (aggregator, documentid)
    GROUP BY 1, 2, 3`;

  return rows.map((row) => ({
    aggregator: row.aggregator,
    store: row.store,
    month: row.month,
    net: num(row.net),
    vat: num(row.vat),
    gross: num(row.gross),
    deliveryGross: num(row.delivery_gross),
    lines: num(row.lines),
    invoices: num(row.invoices),
    salesGross: num(row.sales_gross),
  }));
}

/** Store names for the Store filter, scoped by aggregator + brand only. */
export async function getMktReportStores(
  aggregators: InvoiceAggregator[],
  projectCodes: string[] | null,
): Promise<string[]> {
  if (projectCodes?.length === 0) return [];

  const parts = selected(aggregators).map((aggregator) => {
    const { header, store } = SOURCES[aggregator];
    const where = projectCodes
      ? Prisma.sql`WHERE h.project IN (${Prisma.join(projectCodes)})`
      : Prisma.empty;
    return Prisma.sql`SELECT ${store} AS store FROM ${header} h ${where}`;
  });

  const rows = await prisma.$queryRaw<{ store: string }[]>`
    SELECT DISTINCT store FROM (${Prisma.join(parts, " UNION ")}) s
    WHERE store IS NOT NULL ORDER BY store`;
  return rows.map((row) => row.store);
}
