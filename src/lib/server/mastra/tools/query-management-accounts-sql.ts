import { createTool } from "@mastra/core/tools";
import sql from "mssql";
import { z } from "zod";
import {
  MANAGEMENT_ACCOUNTS_SCOPE_RUNTIME_KEY,
  type ManagementAccountsScope,
} from "../chat-registry";
import { getMssqlEnv } from "../env";

const MAX_ROWS = 200;
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * T-SQL verbs/functions that must never appear in agent-generated SQL. Every
 * query also runs inside a transaction that is always rolled back, so this
 * list is the first line of defence with a clearer error, not the only one.
 */
const FORBIDDEN_PATTERN =
  /\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|deny|exec|execute|into|declare|set|use|dbcc|backup|restore|kill|shutdown|waitfor|bulk|openrowset|opendatasource|openquery|openxml|reconfigure|commit|rollback|begin|save|xp_\w+|sp_\w+)\b/i;

export type ManagementAccountsSqlResult =
  | {
      ok: true;
      rowCount: number;
      truncated: boolean;
      rows: Record<string, unknown>[];
    }
  | { ok: false; error: string };

/** Single read-only SELECT / WITH statement, no forbidden verbs, no comments. */
export function validateReadOnlyTsql(
  query: string,
): { ok: true; sql: string } | { ok: false; error: string } {
  const cleaned = query.trim().replace(/;+\s*$/, "");

  if (!cleaned) return { ok: false, error: "Empty SQL statement." };
  if (cleaned.includes(";")) {
    return {
      ok: false,
      error: "Only a single SQL statement is allowed (no semicolons).",
    };
  }
  // Comments could hide a second statement from the keyword check.
  if (/--|\/\*/.test(cleaned)) {
    return { ok: false, error: "SQL comments are not allowed." };
  }
  if (!/^(select|with)\b/i.test(cleaned)) {
    return {
      ok: false,
      error: "Only read-only SELECT (or WITH ... SELECT) queries are allowed.",
    };
  }
  const forbidden = cleaned.match(FORBIDDEN_PATTERN);
  if (forbidden) {
    return {
      ok: false,
      error: `Forbidden keyword "${forbidden[0]}" — only read-only SELECT queries are allowed.`,
    };
  }
  return { ok: true, sql: cleaned };
}

/** The only warehouse objects the assistant may read. */
const ALLOWED_OBJECTS = new Set(["sapbw_gl", "sapbw_coa", "sapbw_budgets"]);
/** Company-bearing tables, swapped for a CTE filtered to the user's databaseIds. */
const SCOPED_TABLES: Record<string, string> = {
  sapbw_gl: "scoped_gl",
  sapbw_budgets: "scoped_budgets",
};
const SCOPED_TABLE_REF =
  /(?:\[?dbo\]?\s*\.\s*)?(?:\[(sapbw_gl|sapbw_budgets)\]|\b(sapbw_gl|sapbw_budgets)\b)/gi;

/** Applies `fn` to the SQL outside single-quoted literals (literals kept verbatim). */
function mapOutsideLiterals(query: string, fn: (code: string) => string) {
  return query
    .split(/('(?:[^']|'')*')/)
    .map((part, index) => (index % 2 === 1 ? part : fn(part)))
    .join("");
}

/** The SQL with every single-quoted literal emptied, for scanning code only. */
const stripLiterals = (query: string) => query.replace(/'(?:[^']|'')*'/g, "''");

export type TsqlScopeResult =
  | { ok: true; sql: string; databaseIds: string[] }
  | { ok: false; error: string };

/**
 * Hard company-scope guardrail for agent T-SQL (runs after validateReadOnlyTsql).
 * 1. Only sapbw_gl / sapbw_coa / sapbw_budgets: any other known warehouse
 *    object, `sys`, INFORMATION_SCHEMA or a three-part / cross-database name is
 *    rejected.
 * 2. Unless `scope.all`, every gl/budgets reference is renamed to a CTE that
 *    filters `databaseId` to the user's companies (bound as @ma_db* params),
 *    so the query cannot see other companies whatever its WHERE says.
 * `knownObjects` = lowercased names of the warehouse's tables/views/etc.
 */
export function scopeTsql(
  query: string,
  scope: ManagementAccountsScope,
  knownObjects: Set<string>,
): TsqlScopeResult {
  const code = stripLiterals(query).toLowerCase();
  if (/\bsys\s*\.|\binformation_schema\b|\.\s*\./.test(code)) {
    return {
      ok: false,
      error: "System catalogs and cross-database names are not allowed.",
    };
  }
  if (/[\w\]]\s*\.\s*[\w[]+\]?\s*\.\s*[\w[]/.test(code)) {
    return {
      ok: false,
      error:
        "Three-part names are not allowed; use dbo.<table> and table aliases.",
    };
  }
  for (const token of code.match(/[a-z_][\w$#@]*/g) ?? []) {
    if (knownObjects.has(token) && !ALLOWED_OBJECTS.has(token)) {
      return {
        ok: false,
        error: `Table "${token}" is not available. Only dbo.sapbw_gl, dbo.sapbw_coa and dbo.sapbw_budgets can be queried.`,
      };
    }
  }

  if (scope.all) return { ok: true, sql: query, databaseIds: [] };

  const databaseIds = scope.companies.map((company) => company.databaseId);
  if (databaseIds.length === 0) {
    return {
      ok: false,
      error:
        "The user has no companies in scope (none of their assigned brands maps to a ledger company). Do not run any query; tell the user to ask an admin to assign their brands.",
    };
  }

  const rewritten = mapOutsideLiterals(query, (part) =>
    part.replace(
      SCOPED_TABLE_REF,
      (_, bracketed: string | undefined, bare: string | undefined) =>
        SCOPED_TABLES[(bracketed ?? bare ?? "").toLowerCase()],
    ),
  );
  if (/sapbw_gl|sapbw_budgets/i.test(stripLiterals(rewritten))) {
    return {
      ok: false,
      error:
        "Reference the tables as dbo.sapbw_gl / dbo.sapbw_budgets (optionally bracketed) and retry.",
    };
  }

  const idList = databaseIds.map((_, index) => `@ma_db${index}`).join(", ");
  const ctes =
    `scoped_gl AS (SELECT * FROM dbo.sapbw_gl WHERE databaseId IN (${idList})), ` +
    `scoped_budgets AS (SELECT * FROM dbo.sapbw_budgets WHERE databaseId IN (${idList}))`;
  const withBody = rewritten.match(/^with\b([\s\S]*)$/i);
  const sql = withBody
    ? `WITH ${ctes},${withBody[1]}`
    : `WITH ${ctes} ${rewritten}`;
  return { ok: true, sql, databaseIds };
}

const globalForMgmtSql = globalThis as typeof globalThis & {
  managementAccountsSqlPool?: Promise<sql.ConnectionPool>;
};

// Own pool (not $lib/server/mssql) so the mastra dir stays free of SvelteKit
// virtual modules and `mastra dev` can bundle it.
function getPool(): Promise<sql.ConnectionPool> | null {
  const env = getMssqlEnv();
  if (!env) return null;
  globalForMgmtSql.managementAccountsSqlPool ??= new sql.ConnectionPool({
    server: env.server,
    port: env.port,
    user: env.user,
    password: env.password,
    database: env.database,
    requestTimeout: REQUEST_TIMEOUT_MS,
    pool: { max: 3 },
    options: {
      encrypt: env.encrypt,
      trustServerCertificate: env.trustServerCertificate,
    },
  })
    .connect()
    .catch((cause: unknown) => {
      globalForMgmtSql.managementAccountsSqlPool = undefined;
      throw cause;
    });
  return globalForMgmtSql.managementAccountsSqlPool;
}

function toSerializable(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return Number(value);
  return value;
}

let knownObjectsCache: { at: number; names: Set<string> } | null = null;

/** Lowercased names of the warehouse's user objects (tables, views, synonyms…), cached 10 min. */
async function getKnownObjects(pool: sql.ConnectionPool): Promise<Set<string>> {
  if (knownObjectsCache && Date.now() - knownObjectsCache.at < 600_000) {
    return knownObjectsCache.names;
  }
  const result = await pool.request().query<{
    name: string;
  }>("SELECT name FROM sys.objects WHERE is_ms_shipped = 0");
  const names = new Set(result.recordset.map((row) => row.name.toLowerCase()));
  knownObjectsCache = { at: Date.now(), names };
  return names;
}

/** Runs a validated, company-scoped query in an always-rolled-back transaction, capped at MAX_ROWS. */
export async function runReadOnlyManagementAccountsQuery(
  query: string,
  scope: ManagementAccountsScope | undefined,
): Promise<ManagementAccountsSqlResult> {
  const validation = validateReadOnlyTsql(query);
  if (!validation.ok) {
    console.warn(
      `[management-accounts-sql] rejected: ${validation.error}\n${query}`,
    );
    return validation;
  }
  if (!scope) {
    return {
      ok: false,
      error:
        "Company scope is missing for this request, so the query was not run. Tell the user the data cannot be accessed right now.",
    };
  }

  const poolPromise = getPool();
  if (!poolPromise) {
    return {
      ok: false,
      error: "The SAP warehouse (MS_SQL_*) is not configured.",
    };
  }

  const startedAt = Date.now();
  let transaction: sql.Transaction | null = null;

  try {
    const pool = await poolPromise;
    const scoped = scopeTsql(
      validation.sql,
      scope,
      await getKnownObjects(pool),
    );
    if (!scoped.ok) {
      console.warn(
        `[management-accounts-sql] scope rejected: ${scoped.error}\n${query}`,
      );
      return scoped;
    }
    console.log(`[management-accounts-sql] query:\n${scoped.sql}`);
    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    // ROWCOUNT caps any statement shape (CTEs, ORDER BY) without rewriting it;
    // reset in the same batch because it is session state on a pooled connection.
    const request = new sql.Request(transaction);
    scoped.databaseIds.forEach((id, index) =>
      request.input(`ma_db${index}`, sql.NVarChar(100), id),
    );
    const result = await request.query(
      `SET ROWCOUNT ${MAX_ROWS + 1}; ${scoped.sql}; SET ROWCOUNT 0;`,
    );
    const rows = result.recordset ?? [];
    const truncated = rows.length > MAX_ROWS;
    const limited = truncated ? rows.slice(0, MAX_ROWS) : rows;

    console.log(
      `[management-accounts-sql] ${limited.length} row(s) in ${Date.now() - startedAt}ms${truncated ? " (truncated)" : ""}`,
    );

    return {
      ok: true,
      rowCount: limited.length,
      truncated,
      rows: limited.map((row: Record<string, unknown>) =>
        Object.fromEntries(
          Object.entries(row).map(([column, cell]) => [
            column,
            toSerializable(cell),
          ]),
        ),
      ),
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(
      `[management-accounts-sql] failed in ${Date.now() - startedAt}ms: ${message}`,
    );
    return { ok: false, error: `Query failed: ${message}` };
  } finally {
    await transaction?.rollback().catch(() => {});
  }
}

export const queryManagementAccountsSql = createTool({
  id: "query-management-accounts-sql",
  description:
    "Run a single read-only T-SQL SELECT against the SAP business warehouse (MSSQL SAPBW): " +
    "dbo.sapbw_gl (general-ledger postings), dbo.sapbw_coa (chart of accounts), dbo.sapbw_budgets (budgets/forecasts). " +
    `Returns at most ${MAX_ROWS} rows — aggregate with SUM/COUNT/GROUP BY. Use TOP, not LIMIT. ` +
    "Results are automatically limited to the companies the user may see; no other tables are allowed. " +
    "Load the management-accounts-sql skill before writing queries.",
  inputSchema: z.object({
    sql: z
      .string()
      .describe(
        "One T-SQL SELECT (or WITH ... SELECT) statement, no semicolons or comments, e.g. SELECT TOP 10 GLAccount, SUM(Credit - Debit) AS value FROM dbo.sapbw_gl GROUP BY GLAccount.",
      ),
  }),
  // Scope is published by the chat endpoint (never client-supplied); absent fails closed.
  execute: async ({ sql: query }, context) =>
    runReadOnlyManagementAccountsQuery(
      query,
      context?.requestContext?.get(MANAGEMENT_ACCOUNTS_SCOPE_RUNTIME_KEY) as
        | ManagementAccountsScope
        | undefined,
    ),
});
