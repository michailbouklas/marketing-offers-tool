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
  monthlyMatrix,
  parseMonth,
  type MarketingAccountDetail,
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

type LineFilter = {
  years: number[];
  databaseIds: string[] | null;
  month: number | null;
  /** Restrict to one GL account (`sapbw_gl.GLAccount`). */
  account?: string;
};

/**
 * Binds the Power BI marketing rules onto `request` and returns the SQL that
 * selects marketing GL lines as `g` (sapbw_gl) joined to `c` (COA). The table
 * and the account drill-down both use it, so their numbers cannot drift apart.
 */
function bindMarketingLines(request: sql.Request, filter: LineFilter) {
  const { years, databaseIds, month, account } = filter;
  request
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
  const exclList = bindExcludedDatabaseIds(request);
  const companyFilter = bindCompanyFilter(request, "g.databaseId", databaseIds);
  if (month) request.input("month", sql.Int, month);
  const monthFilter = month ? "AND MONTH(g.PostingDate) = @month" : "";
  if (account) request.input("account", sql.NVarChar(15), account);
  const accountFilter = account ? "AND g.GLAccount = @account" : "";

  // COA holds PHC_EUR only but its codes are group-wide, so join on code alone;
  // DISTINCT guards against the few duplicated Level5Code rows.
  // TranstypeCode -3 = year-end closing/opening entries, which zero the P&L.
  const lines = `
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
        ${accountFilter}
        AND g.PostingDate >= @from AND g.PostingDate < @to`;
  return { lines, isAggMarketing };
}

function bindExcludedDatabaseIds(request: sql.Request): string {
  EXCLUDED_DATABASE_IDS.forEach((id, index) =>
    request.input(`excl${index}`, sql.NVarChar(50), id),
  );
  return EXCLUDED_DATABASE_IDS.map((_, index) => `@excl${index}`).join(", ");
}

/** `AND <column> IN (@db0, …)`, or "" when `databaseIds` is null (all companies). */
function bindCompanyFilter(
  request: sql.Request,
  column: string,
  databaseIds: string[] | null,
): string {
  databaseIds?.forEach((id, index) =>
    request.input(`db${index}`, sql.NVarChar(100), id),
  );
  return databaseIds
    ? `AND ${column} IN (${databaseIds.map((_, i) => `@db${i}`).join(", ")})`
    : "";
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
  const request = pool.request();
  const { lines, isAggMarketing } = bindMarketingLines(request, {
    years,
    databaseIds,
    month,
  });
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
      ${lines}
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
 * `?company=` GL name → the company and the `databaseId`s to query. Unknown or
 * out-of-scope names fall back to all of the user's companies (null = no filter).
 */
export function resolveCompanySelection(
  requested: string | null,
  scope: ManagementAccountsScope,
) {
  const selected = scope.companies.find(
    (company) => company.companyName === requested,
  );
  const databaseIds = selected
    ? [selected.databaseId]
    : scope.all
      ? null
      : scope.companies.map((company) => company.databaseId);
  return { selected, databaseIds };
}

/**
 * Brand of a GL line from `companyName` + `CostCenter`. Same map as §4 of
 * `mastra/workspace/skills/management-accounts-sql/SKILL.md`: change both together.
 */
const BRAND_SQL = `CASE
  WHEN g.companyName = 'PHC FRANCHISED RESTAURANTS PUBLIC LTD' AND g.CostCenter = 'PH'   THEN 'Pizza Hut'
  WHEN g.companyName = 'PHC FRANCHISED RESTAURANTS PUBLIC LTD' AND g.CostCenter = 'KFC'  THEN 'KFC'
  WHEN g.companyName = 'PHC FRANCHISED RESTAURANTS PUBLIC LTD' AND g.CostCenter = 'TACO' THEN 'Taco Bell'
  WHEN g.companyName = 'WOW BURGERS LTD'                       AND g.CostCenter = 'BK'   THEN 'Burger King'
  WHEN g.companyName = 'DAFERA LTD'                            AND g.CostCenter = 'DAF'  THEN 'Wagamama'
  WHEN g.companyName = 'HETAFRE TRADING LTD'                   AND g.CostCenter = 'NER'  THEN 'Café Nero'
  WHEN g.companyName = 'CAYLINK LTD'                                                    THEN 'Café Nero'
  WHEN g.companyName = 'AVANTAGE B&P CAFE LTD'                 AND g.CostCenter = 'CAF'  THEN 'Paul'
  WHEN g.companyName = 'Avantage B&R Italian Restaurants Ltd'  AND g.CostCenter = 'REST' THEN 'Jamie Oliver'
  WHEN g.companyName = 'CATERCOM LTD'                          AND g.CostCenter IN ('CAF','REST') THEN 'C&R'
  WHEN g.companyName = 'CATERCOM LTD'                          AND g.CostCenter = 'DER'  THEN 'Tavernaki'
  WHEN g.companyName = 'CATERCOM LTD'                          AND g.CostCenter = 'CAT'  THEN 'Catering'
  ELSE 'Unallocated / head office'
END`;

const MAX_POSTINGS = 500;
const BUDGET_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

/**
 * The account's lines for one year plus each document's supplier. The supplier
 * is the business partner on the same document (`databaseId + TransId`), taken
 * only when the document has exactly one: AP invoices always do, while journal
 * entries usually carry many partners (13.5k of 15.2k in 2025), so they get none.
 */
function accountLinesCte(lines: string): string {
  return `
    WITH acct AS (
      SELECT g.databaseId, g.TransId, g.PostingDate, g.OriginalDocNo, g.TransTypeName,
             g.companyName, ${BRAND_SQL} AS brand, g.StoreLocationName, g.LineRemarks,
             g.Credit - g.Debit AS value
      ${lines}
    ),
    sup AS (
      SELECT s.databaseId, s.TransId, MAX(s.BPName) AS supplier
      FROM dbo.sapbw_gl s
      JOIN (SELECT DISTINCT databaseId, TransId FROM acct) d
        ON d.databaseId = s.databaseId AND d.TransId = s.TransId
      WHERE s.BPName <> ''
      GROUP BY s.databaseId, s.TransId
      HAVING COUNT(DISTINCT s.BPName) = 1
    )`;
}

const text = (value: string | null) => (value ?? "").trim();

/**
 * Drill-down for one marketing GL account: monthly trend over `years`, and for
 * `year` the breakdown, the largest postings and budget vs actual. Null when
 * the code is not a marketing account under the Power BI rules, so the
 * endpoint cannot read arbitrary GL accounts.
 */
export async function getMarketingAccountDetail(params: {
  code: string;
  year: number;
  years: number[];
  databaseIds: string[] | null;
  month: number | null;
}): Promise<MarketingAccountDetail | null> {
  const { code, year, years, databaseIds, month } = params;
  const pool = await getMssqlPool();

  const isAgg = (AGGREGATOR_MARKETING_ACCOUNTS as readonly string[]).includes(
    code,
  );
  const coa = await pool
    .request()
    .input("code", sql.NVarChar(15), code)
    .input("aggFees", sql.NVarChar(50), AGGREGATOR_FEES_LEVEL4).query<{
    level4Name: string;
    level5Name: string;
  }>(`
      SELECT TOP 1 Level4Name AS level4Name, Level5Name AS level5Name
      FROM dbo.sapbw_coa
      WHERE Level5Code = @code AND Level3Name = 'Marketing'
        ${isAgg ? "" : "AND Level4Code <> @aggFees"}`);
  const account = coa.recordset[0];
  if (!account) return null;

  const empty = {
    code,
    name: text(account.level5Name),
    group: isAgg ? INTERNET_ADVERTISING.name : text(account.level4Name),
    year,
    years,
  };
  if (databaseIds?.length === 0) {
    const zeros = Array<number>(12).fill(0);
    return {
      ...empty,
      monthly: years.map(() => [...zeros]),
      breakdown: [],
      postings: [],
      postingCount: 0,
      budgetCompanies: [],
      budget: zeros,
      budgetActual: zeros,
    };
  }

  const yearFilter = { years: [year], databaseIds, month, account: code };

  // Trend: every year, every month (the page's month filter would leave 11 empty bars).
  const monthlyRequest = pool.request();
  const monthlyLines = bindMarketingLines(monthlyRequest, {
    years,
    databaseIds,
    month: null,
    account: code,
  }).lines;

  const breakdownRequest = pool.request();
  const breakdownCte = accountLinesCte(
    bindMarketingLines(breakdownRequest, yearFilter).lines,
  );

  const postingsRequest = pool.request().input("top", sql.Int, MAX_POSTINGS);
  const postingsCte = accountLinesCte(
    bindMarketingLines(postingsRequest, yearFilter).lines,
  );

  const budgetRequest = pool
    .request()
    .input("code", sql.NVarChar(15), code)
    .input("year", sql.NVarChar(4), String(year));
  const budgetExcl = bindExcludedDatabaseIds(budgetRequest);
  const budgetCompanyFilter = bindCompanyFilter(
    budgetRequest,
    "b.databaseId",
    databaseIds,
  );

  const [monthly, breakdown, postings, budget] = await Promise.all([
    monthlyRequest.query<{
      year: number;
      month: number;
      company: string;
      value: number | string;
    }>(`
      SELECT YEAR(g.PostingDate) AS year, MONTH(g.PostingDate) AS month,
             g.companyName AS company, SUM(g.Credit - g.Debit) AS value
      ${monthlyLines}
      GROUP BY YEAR(g.PostingDate), MONTH(g.PostingDate), g.companyName`),
    breakdownRequest.query<{
      company: string;
      brand: string;
      store: string | null;
      type: string;
      supplier: string | null;
      value: number | string;
      lines: number;
    }>(`${breakdownCte}
      SELECT a.companyName AS company, a.brand, a.StoreLocationName AS store,
             a.TransTypeName AS type, s.supplier, SUM(a.value) AS value, COUNT(*) AS lines
      FROM acct a
      LEFT JOIN sup s ON s.databaseId = a.databaseId AND s.TransId = a.TransId
      GROUP BY a.companyName, a.brand, a.StoreLocationName, a.TransTypeName, s.supplier`),
    postingsRequest.query<{
      date: Date;
      transId: number;
      docNo: string | null;
      type: string;
      company: string;
      brand: string;
      store: string | null;
      supplier: string | null;
      remarks: string | null;
      value: number | string;
      total: number;
    }>(`${postingsCte}
      SELECT TOP (@top) a.PostingDate AS date, a.TransId AS transId,
             a.OriginalDocNo AS docNo, a.TransTypeName AS type,
             a.companyName AS company, a.brand, a.StoreLocationName AS store,
             s.supplier, a.LineRemarks AS remarks, a.value,
             COUNT(*) OVER () AS total
      FROM acct a
      LEFT JOIN sup s ON s.databaseId = a.databaseId AND s.TransId = a.TransId
      ORDER BY ABS(a.value) DESC, a.PostingDate`),
    budgetRequest.query<{ company: string } & Record<string, number | string>>(`
      SELECT b.companyname AS company,
             ${BUDGET_MONTHS.map((m, i) => `SUM(ISNULL(b.U_BA${m}, 0)) AS m${i}`).join(", ")}
      FROM dbo.sapbw_budgets b
      WHERE b.U_Acctcode = @code AND b.U_YEAR = @year
        AND b.databaseId NOT IN (${budgetExcl})
        ${budgetCompanyFilter}
      GROUP BY b.companyname
      -- An all-empty budget row means "not budgeted", not "budget 0" (e.g. WOW 61012015 2026).
      HAVING ${BUDGET_MONTHS.map((m) => `SUM(ABS(ISNULL(b.U_BA${m}, 0)))`).join(" + ")} > 0`),
  ]);

  const monthlyRows = monthly.recordset.map((row) => ({
    year: row.year,
    month: row.month,
    company: text(row.company),
    value: Number(row.value),
  }));
  const budgetCompanies = budget.recordset.map((row) => text(row.company));
  const budgetSet = new Set(budgetCompanies);
  // Actual for the budgeted companies only, so a partial budget is not compared with everyone.
  const [budgetActual] = monthlyMatrix(
    monthlyRows.filter((row) => budgetSet.has(row.company)),
    [year],
  );

  return {
    ...empty,
    monthly: monthlyMatrix(monthlyRows, years),
    breakdown: breakdown.recordset.map((row) => ({
      company: text(row.company),
      brand: row.brand,
      store: text(row.store),
      type: text(row.type),
      supplier: text(row.supplier),
      value: Number(row.value),
      lines: row.lines,
    })),
    postings: postings.recordset.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      transId: row.transId,
      docNo: text(row.docNo),
      type: text(row.type),
      company: text(row.company),
      brand: row.brand,
      store: text(row.store),
      supplier: text(row.supplier),
      remarks: text(row.remarks),
      value: Number(row.value),
    })),
    postingCount: postings.recordset[0]?.total ?? 0,
    budgetCompanies,
    budget: BUDGET_MONTHS.map((_, index) =>
      budget.recordset.reduce(
        (sum, row) => sum + Number(row[`m${index}`] ?? 0),
        0,
      ),
    ),
    budgetActual,
  };
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
  const { selected, databaseIds } = resolveCompanySelection(requested, scope);
  const years = marketingCostYears();
  const rows = await getMarketingCostRows(years, databaseIds, month);
  return {
    companies: scope.companies.map((company) => company.companyName),
    company: selected?.companyName ?? null,
    month,
    table: buildMarketingCostTable(rows, years),
  };
}
