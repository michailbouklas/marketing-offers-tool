import { adminRoles, hasAnyRole } from "$lib/auth/roles";
import type {
  GlCompany,
  ManagementAccountsScope,
} from "$lib/server/mastra/chat-registry";
import { getMssqlPool, sql } from "$lib/server/mssql";
import { prisma } from "$lib/server/prisma";
import {
  buildMarketingCostTable,
  marketingCostYears,
  parseMonth,
  type MarketingCostRow,
} from "$lib/services/management-accounts";

/**
 * Aggregator "Marketing Costs" accounts (Foody, Wolt, Bolt). In the COA they sit
 * under Level4 610120 "Aggregators Fees & Advertising", but Power BI reports
 * them under "Internet Advertising Expenses". The rest of 610120 is the
 * Aggregator Commissions block, not Marketing. Matched against Power BI 2023–2026.
 */
export const AGGREGATOR_MARKETING_ACCOUNTS = [
  "61012014",
  "61012015",
  "61012016",
] as const;
const AGGREGATOR_FEES_LEVEL4 = "610120";
/**
 * Power BI leaves this company out of the whole Financial Performance widget
 * (verified against the PBI export 2026-11-06: excluding it closes the Marketing,
 * Finance Cost and Depreciation gaps). The reason is upstream and unknown.
 */
export const EXCLUDED_DATABASE_IDS = ["ODLONEDB"] as const;
const INTERNET_ADVERTISING = {
  code: "610121",
  name: "Internet Advertising Expenses",
};

type Row = {
  level4Code: string;
  level4Name: string;
  level5Code: string;
  level5Name: string;
  year: number;
  value: number | string;
};

let companiesCache: { at: number; companies: GlCompany[] } | null = null;

/** GL companies (cached 10 min), without the companies Power BI excludes. */
export async function listGlCompanies(): Promise<GlCompany[]> {
  if (companiesCache && Date.now() - companiesCache.at < 600_000) {
    return companiesCache.companies;
  }
  const pool = await getMssqlPool();
  const request = pool.request();
  EXCLUDED_DATABASE_IDS.forEach((id, index) =>
    request.input(`excl${index}`, sql.NVarChar(50), id),
  );
  const exclList = EXCLUDED_DATABASE_IDS.map((_, i) => `@excl${i}`).join(", ");
  const result = await request.query<GlCompany>(`
    SELECT DISTINCT databaseId, companyName FROM dbo.sapbw_gl
    WHERE companyName IS NOT NULL AND databaseId NOT IN (${exclList})
    ORDER BY companyName`);
  const companies = result.recordset.map((row) => ({
    databaseId: row.databaseId.trim(),
    companyName: row.companyName.trim(),
  }));
  companiesCache = { at: Date.now(), companies };
  return companies;
}

/**
 * GL companies the user may see. Admin roles see all (like `listScopedBrands`);
 * everyone else sees the active companies operating one of their assigned
 * brands, matched to the GL on `Company.sapDatabaseId`.
 */
export async function resolveManagementAccountsScope(user: {
  id: string;
  role: string | null | undefined;
}): Promise<ManagementAccountsScope> {
  const companies = await listGlCompanies();
  if (hasAnyRole(user.role, adminRoles)) return { all: true, companies };

  const mapped = await prisma.company.findMany({
    where: {
      active: true,
      sapDatabaseId: { not: null },
      brands: {
        some: { brand: { user_assignments: { some: { userId: user.id } } } },
      },
    },
    select: { sapDatabaseId: true },
  });
  const allowed = new Set(mapped.map((company) => company.sapDatabaseId));
  return {
    all: false,
    companies: companies.filter((company) => allowed.has(company.databaseId)),
  };
}

/**
 * Marketing cost per GL account and calendar year (Credit − Debit, EUR), for
 * the given GL `databaseId`s or, when null, every company.
 */
export async function getMarketingCostRows(
  years: number[],
  databaseIds: string[] | null = null,
  month: number | null = null,
): Promise<MarketingCostRow[]> {
  if (years.length === 0 || databaseIds?.length === 0) return [];

  const pool = await getMssqlPool();
  const request = pool
    .request()
    .input("from", sql.Date, new Date(Date.UTC(Math.min(...years), 0, 1)))
    .input("to", sql.Date, new Date(Date.UTC(Math.max(...years) + 1, 0, 1)))
    .input("aggFees", sql.NVarChar(50), AGGREGATOR_FEES_LEVEL4)
    .input("internetCode", sql.NVarChar(50), INTERNET_ADVERTISING.code)
    .input("internetName", sql.NVarChar(100), INTERNET_ADVERTISING.name);
  AGGREGATOR_MARKETING_ACCOUNTS.forEach((code, index) =>
    request.input(`agg${index}`, sql.NVarChar(15), code),
  );
  const aggList = AGGREGATOR_MARKETING_ACCOUNTS.map(
    (_, index) => `@agg${index}`,
  ).join(", ");
  const isAggMarketing = `g.GLAccount IN (${aggList})`;
  EXCLUDED_DATABASE_IDS.forEach((id, index) =>
    request.input(`excl${index}`, sql.NVarChar(50), id),
  );
  const exclList = EXCLUDED_DATABASE_IDS.map(
    (_, index) => `@excl${index}`,
  ).join(", ");
  databaseIds?.forEach((id, index) =>
    request.input(`db${index}`, sql.NVarChar(100), id),
  );
  const companyFilter = databaseIds
    ? `AND g.databaseId IN (${databaseIds.map((_, i) => `@db${i}`).join(", ")})`
    : "";
  if (month) request.input("month", sql.Int, month);
  const monthFilter = month ? "AND MONTH(g.PostingDate) = @month" : "";

  // COA holds PHC_EUR only but its codes are group-wide, so join on code alone;
  // DISTINCT guards against the few duplicated Level5Code rows.
  // TranstypeCode -3 = year-end closing/opening entries, which zero the P&L.
  const result = await request.query<Row>(`
    SELECT level4Code, level4Name, level5Code, level5Name, year, SUM(amount) AS value
    FROM (
      SELECT
        CASE WHEN ${isAggMarketing} THEN @internetCode ELSE c.Level4Code END AS level4Code,
        CASE WHEN ${isAggMarketing} THEN @internetName ELSE c.Level4Name END AS level4Name,
        c.Level5Code AS level5Code,
        c.Level5Name AS level5Name,
        YEAR(g.PostingDate) AS year,
        g.Credit - g.Debit AS amount
      FROM dbo.sapbw_gl g
      JOIN (
        SELECT DISTINCT Level3Name, Level4Code, Level4Name, Level5Code, Level5Name
        FROM dbo.sapbw_coa
      ) c ON c.Level5Code = g.GLAccount
      WHERE c.Level3Name = 'Marketing'
        AND (c.Level4Code <> @aggFees OR ${isAggMarketing})
        AND g.TranstypeCode <> '-3'
        AND g.databaseId NOT IN (${exclList})
        ${companyFilter}
        ${monthFilter}
        AND g.PostingDate >= @from AND g.PostingDate < @to
    ) lines
    GROUP BY level4Code, level4Name, level5Code, level5Name, year
  `);

  return result.recordset.map((row) => ({
    level4Code: row.level4Code.trim(),
    level4Name: row.level4Name.trim(),
    level5Code: row.level5Code.trim(),
    level5Name: row.level5Name.trim(),
    year: row.year,
    value: Number(row.value),
  }));
}

/**
 * Marketing-cost table for a `?company=` GL name, within the user's scope.
 * Unknown or out-of-scope names fall back to all of the user's companies.
 * `?month=` (1–12) keeps only that month of every year; invalid = all months.
 */
export async function loadMarketingCosts(
  requested: string | null,
  scope: ManagementAccountsScope,
  requestedMonth: string | null = null,
) {
  const month = parseMonth(requestedMonth);
  const selected = scope.companies.find(
    (company) => company.companyName === requested,
  );
  const databaseIds = selected
    ? [selected.databaseId]
    : scope.all
      ? null
      : scope.companies.map((company) => company.databaseId);
  const years = marketingCostYears();
  const rows = await getMarketingCostRows(years, databaseIds, month);
  return {
    companies: scope.companies.map((company) => company.companyName),
    company: selected?.companyName ?? null,
    month,
    table: buildMarketingCostTable(rows, years),
  };
}
