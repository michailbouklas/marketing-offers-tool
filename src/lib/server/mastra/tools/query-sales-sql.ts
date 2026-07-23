import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { BRAND_SCOPE_RUNTIME_KEY } from "../chat-registry";
import { getSalesClickhouseEnv } from "../env";

const MAX_ROWS = 200;
const MAX_EXECUTION_TIME_S = 15;
const REQUEST_TIMEOUT_MS = 20_000;
const KNOWN_BRANDS_TTL_MS = 10 * 60_000;

/**
 * Verbs, table functions, and escape hatches that must never appear in
 * agent-generated ClickHouse SQL. The connection additionally runs with
 * `readonly = 2` (writes/DDL/KILL blocked server-side), so this list is a
 * first line of defense with a clearer error message, not the only barrier.
 * `settings` is forbidden so the model cannot relax the per-query limits.
 */
const FORBIDDEN_PATTERN =
  /\b(insert|alter|create|drop|truncate|rename|attach|detach|optimize|system|kill|grant|revoke|set|settings|use|exchange|move|undrop|watch|update|delete|url|file|s3|s3Cluster|remote|remoteSecure|cluster|clusterAllReplicas|mysql|postgresql|mongodb|redis|jdbc|odbc|hdfs|azureBlobStorage|iceberg|deltaLake|hudi|executable|input|sleep|sleepEachRow)\b/i;

/**
 * Keeps the agent inside the sales database: the connection's default
 * database already scopes unqualified names, and qualified references to
 * ClickHouse's own metadata schemas are rejected outright.
 */
const FORBIDDEN_SCHEMA_PATTERN = /\b(system|information_schema)\s*\./i;

/** ClickHouse numeric types arrive as strings over JSON to preserve precision. */
const NUMERIC_TYPE_PATTERN =
  /^(?:Nullable\()?(?:U?Int\d+|Float\d+|Decimal(?:\d+)?(?:\(.*\))?)\)?$/;

export type SalesSqlResult =
  | {
      ok: true;
      rowCount: number;
      /** True when the query matched more than MAX_ROWS rows. */
      truncated: boolean;
      rows: Record<string, unknown>[];
    }
  | { ok: false; error: string };

const globalForSalesSql = globalThis as typeof globalThis & {
  salesSqlClient?: ClickHouseClient;
  salesKnownBrands?: { brands: Set<string>; fetchedAt: number };
};

/**
 * Credentials embedded in CLICKHOUSE_URL take precedence in
 * @clickhouse/client and trigger an "overridden by a URL parameter" warning
 * when username/password are also passed as options. Hoist them into the
 * explicit options and pass a clean URL — slim copy of
 * resolveClickHouseCredentials in src/lib/server/clickhouse.ts, which this
 * tool cannot import because it uses SvelteKit's $env virtual module.
 */
function resolveCredentials(env: {
  url: string;
  username: string;
  password: string;
}): { url: string; username: string; password: string } {
  const parsed = new URL(env.url);
  let { username, password } = env;

  if (parsed.username) {
    username = decodeURIComponent(parsed.username);
    parsed.username = "";
  }
  if (parsed.password) {
    password = decodeURIComponent(parsed.password);
    parsed.password = "";
  }

  const queryUser = parsed.searchParams.get("user");
  if (queryUser !== null) {
    username = queryUser;
    parsed.searchParams.delete("user");
  }
  const queryPassword = parsed.searchParams.get("password");
  if (queryPassword !== null) {
    password = queryPassword;
    parsed.searchParams.delete("password");
  }

  return { url: parsed.toString(), username, password };
}

/**
 * Dedicated client instead of the app's $lib/server/clickhouse singleton:
 * that module imports SvelteKit virtual modules, and skipping it keeps the
 * whole mastra directory bundleable by `mastra dev` (playground). The
 * connection defaults to the Novasero sales database and runs every query
 * with ClickHouse-native read-only enforcement.
 */
function getClient(): ClickHouseClient | null {
  if (globalForSalesSql.salesSqlClient) {
    return globalForSalesSql.salesSqlClient;
  }

  const env = getSalesClickhouseEnv();

  if (!env) {
    return null;
  }

  const { url, username, password } = resolveCredentials(env);

  globalForSalesSql.salesSqlClient = createClient({
    url,
    username,
    password,
    database: env.database,
    request_timeout: REQUEST_TIMEOUT_MS,
    clickhouse_settings: {
      // readonly=2 blocks writes/DDL/KILL server-side while still allowing
      // the limit settings below to be sent with the request (readonly=1
      // would reject changing any setting, including our own).
      readonly: "2",
      max_execution_time: MAX_EXECUTION_TIME_S,
      // Backstop only — the primary cap is the LIMIT wrap in the query.
      max_result_rows: "10000",
      result_overflow_mode: "throw",
    },
  });

  return globalForSalesSql.salesSqlClient;
}

/**
 * Validates that the statement is a single read-only SELECT/CTE and rejects
 * anything containing forbidden verbs, table functions, or references to
 * ClickHouse metadata schemas. Returns the cleaned statement or an error
 * message for the agent to self-correct on.
 */
export function validateReadOnlySalesSql(
  sql: string,
): { ok: true; sql: string } | { ok: false; error: string } {
  const cleaned = sql.trim().replace(/;+\s*$/, "");

  if (!cleaned) {
    return { ok: false, error: "Empty SQL statement." };
  }

  if (cleaned.includes(";")) {
    return {
      ok: false,
      error: "Only a single SQL statement is allowed (no semicolons).",
    };
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

  const forbiddenSchema = cleaned.match(FORBIDDEN_SCHEMA_PATTERN);
  if (forbiddenSchema) {
    return {
      ok: false,
      error: `Forbidden schema reference "${forbiddenSchema[0].trim()}" — query only the sales tables (unqualified names).`,
    };
  }

  return { ok: true, sql: cleaned };
}

/**
 * Numify by declared column type only: counts, sums, and Decimal aggregates
 * arrive as strings to preserve precision, and numbers are friendlier for
 * the model. String columns are never touched.
 */
function toSerializable(value: unknown, columnType?: string): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value === "string" &&
    columnType &&
    NUMERIC_TYPE_PATTERN.test(columnType)
  ) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }

  return value;
}

/**
 * All distinct brand codes present in the warehouse, cached with a short TTL.
 * Used to tell brand string literals apart from other literals ('Delivery',
 * dates, item names) when validating the brand scope. Returns null when the
 * lookup fails so the caller can skip literal classification (the
 * filter-presence check below still applies).
 */
async function getKnownBrandCodes(
  client: ClickHouseClient,
): Promise<Set<string> | null> {
  const cached = globalForSalesSql.salesKnownBrands;

  if (cached && Date.now() - cached.fetchedAt < KNOWN_BRANDS_TTL_MS) {
    return cached.brands;
  }

  try {
    const result = await client.query({
      query: "SELECT DISTINCT lower(brand) AS brand FROM transactions",
      format: "JSON",
    });
    const payload = (await result.json()) as { data: { brand: string }[] };
    const brands = new Set(
      payload.data
        .map((row) => row.brand.trim())
        .filter((brand) => brand.length > 0),
    );

    globalForSalesSql.salesKnownBrands = { brands, fetchedAt: Date.now() };
    return brands;
  } catch (cause) {
    console.error(
      `[sales-sql] known-brands lookup failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    return cached?.brands ?? null;
  }
}

/** Single-quoted string literals in the SQL, unescaped ('') and lowercased. */
function extractStringLiterals(sql: string): string[] {
  const literals: string[] = [];

  for (const match of sql.matchAll(/'((?:[^']|'')*)'/g)) {
    const literal = match[1].replaceAll("''", "'").trim().toLowerCase();

    if (literal.length > 0) {
      literals.push(literal);
    }
  }

  return literals;
}

/**
 * Hard brand-scope guardrail, defense-in-depth on top of the agent's
 * instructions: any literal that names a known brand outside the allowed set
 * is rejected, and every query must reference at least one allowed brand (the
 * instructions mandate a `lower(brand) IN (...)` filter on every query).
 * Literal scanning is not a SQL parser — e.g. `brand != 'x'` with an allowed
 * literal elsewhere passes — it targets the realistic leak vectors.
 */
function validateBrandScope(
  sql: string,
  allowedBrands: string[],
  knownBrands: Set<string> | null,
): { ok: true } | { ok: false; error: string } {
  const allowed = new Set(
    allowedBrands.map((brand) => brand.trim().toLowerCase()),
  );
  const literals = extractStringLiterals(sql);

  if (knownBrands) {
    for (const literal of literals) {
      if (knownBrands.has(literal) && !allowed.has(literal)) {
        return {
          ok: false,
          error:
            `Brand '${literal}' is not among the user's assigned brands. ` +
            `Do not retry this query. Reply to the user with exactly: ` +
            `You're not assigned to this brand`,
        };
      }
    }
  }

  if (!literals.some((literal) => allowed.has(literal))) {
    const aliasIn = [...allowed].map((brand) => `'${brand}'`).join(", ");
    return {
      ok: false,
      error:
        `Every query must be restricted to the user's assigned brands. ` +
        `Add a brand filter such as lower(brand) IN (${aliasIn}) and retry.`,
    };
  }

  return { ok: true };
}

/**
 * Executes a validated read-only query with row cap + execution timeout,
 * restricted to the caller's assigned brands. `allowedBrands` comes from the
 * chat endpoint via requestContext — undefined (no scope published) fails
 * closed; in the `mastra dev` playground set `allowedBrandAliases` in the
 * runtime-context panel to test.
 */
export async function runReadOnlySalesQuery(
  sql: string,
  allowedBrands: string[] | undefined,
): Promise<SalesSqlResult> {
  const validation = validateReadOnlySalesSql(sql);

  if (!validation.ok) {
    console.warn(`[sales-sql] rejected: ${validation.error}\n${sql}`);
    return { ok: false, error: validation.error };
  }

  if (allowedBrands === undefined) {
    return {
      ok: false,
      error:
        "Brand scope is missing for this request — the query was not run. " +
        "Tell the user their sales data cannot be accessed right now.",
    };
  }

  if (allowedBrands.length === 0) {
    return {
      ok: false,
      error:
        "The current user has no assigned brands — no sales data is " +
        "available to them. Do not run any query.",
    };
  }

  const client = getClient();

  if (!client) {
    return {
      ok: false,
      error:
        "The sales database is not configured (CLICKHOUSE_URL is missing).",
    };
  }

  const brandScope = validateBrandScope(
    validation.sql,
    allowedBrands,
    await getKnownBrandCodes(client),
  );

  if (!brandScope.ok) {
    console.warn(
      `[sales-sql] brand-scope rejected: ${brandScope.error}\n${sql}`,
    );
    return { ok: false, error: brandScope.error };
  }

  console.log(`[sales-sql] query:\n${validation.sql}`);

  // Row cap is enforced by wrapping, so agent-written LIMITs are optional.
  const wrapped = `SELECT * FROM (${validation.sql}) AS agent_query LIMIT ${MAX_ROWS + 1}`;
  const startedAt = Date.now();

  try {
    // Plain JSON (not JSONEachRow) so meta[].type is available for the
    // type-aware numification in toSerializable.
    const result = await client.query({ query: wrapped, format: "JSON" });
    const payload = (await result.json()) as {
      meta?: { name: string; type: string }[];
      data: Record<string, unknown>[];
    };

    const typeByColumn = new Map(
      (payload.meta ?? []).map((column) => [column.name, column.type]),
    );
    const truncated = payload.data.length > MAX_ROWS;
    const limited = truncated ? payload.data.slice(0, MAX_ROWS) : payload.data;

    console.log(
      `[sales-sql] ${limited.length} row(s) in ${Date.now() - startedAt}ms${
        truncated ? " (truncated)" : ""
      }`,
    );

    return {
      ok: true,
      rowCount: limited.length,
      truncated,
      rows: limited.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([column, cell]) => [
            column,
            toSerializable(cell, typeByColumn.get(column)),
          ]),
        ),
      ),
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(
      `[sales-sql] failed in ${Date.now() - startedAt}ms: ${message}`,
    );
    return { ok: false, error: `Query failed: ${message}` };
  }
}

export const querySalesSql = createTool({
  id: "query-sales-sql",
  description:
    "Run a single read-only ClickHouse SELECT query against the Novasero POS " +
    "sales database (tables transactions, transaction_details; join on " +
    "transactions.pk = transaction_details.transactionid). " +
    "Both tables are partitioned by month on their date column — ALWAYS include " +
    "a date filter so partitions can be pruned. " +
    "Queries are restricted to the user's assigned brands: every query must " +
    "include the brand filter from the Brand scope section, and queries " +
    "naming any other brand are rejected. " +
    `Returns at most ${MAX_ROWS} rows — use aggregations (sum, count, GROUP BY) for totals instead of fetching raw rows.`,
  inputSchema: z.object({
    sql: z
      .string()
      .describe(
        "A single ClickHouse SELECT statement. Use unqualified table names " +
          "(the connection selects the sales database) and always filter on " +
          "tran_date / trde_date, e.g. SELECT sum(tran_net) FROM transactions " +
          "WHERE tran_date >= toDate('2026-01-01').",
      ),
  }),
  execute: async ({ sql }, context) => {
    // Brand scope is published by the chat endpoint (never client-supplied);
    // anything other than a string array fails closed inside the runner.
    const raw = context?.requestContext?.get(BRAND_SCOPE_RUNTIME_KEY);
    const allowedBrands = Array.isArray(raw)
      ? raw.filter((value): value is string => typeof value === "string")
      : undefined;

    return runReadOnlySalesQuery(sql, allowedBrands);
  },
});
