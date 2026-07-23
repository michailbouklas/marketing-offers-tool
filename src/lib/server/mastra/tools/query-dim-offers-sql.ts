import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getClickhouseEnv } from "../env";

const MAX_ROWS = 200;
const MAX_EXECUTION_TIME_S = 15;
const REQUEST_TIMEOUT_MS = 20_000;

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
 * Only ClickHouse's own metadata schemas are off-limits. The data-quality
 * ClickHouse tables live in the default database (dim_offers,
 * transaction_details) with one qualified cross-database join to
 * `apidata_replica.dim_items`, so that reference must stay allowed.
 */
const FORBIDDEN_SCHEMA_PATTERN = /\b(system|information_schema)\s*\./i;

/** ClickHouse numeric types arrive as strings over JSON to preserve precision. */
const NUMERIC_TYPE_PATTERN =
  /^(?:Nullable\()?(?:U?Int\d+|Float\d+|Decimal(?:\d+)?(?:\(.*\))?)\)?$/;

export type DimOffersSqlResult =
  | {
      ok: true;
      rowCount: number;
      /** True when the query matched more than MAX_ROWS rows. */
      truncated: boolean;
      rows: Record<string, unknown>[];
    }
  | { ok: false; error: string };

const globalForDimOffersSql = globalThis as typeof globalThis & {
  dimOffersSqlClient?: ClickHouseClient;
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
 * connection defaults to the same (default) ClickHouse database the
 * data-quality dashboards read and runs every query with ClickHouse-native
 * read-only enforcement.
 */
function getClient(): ClickHouseClient | null {
  if (globalForDimOffersSql.dimOffersSqlClient) {
    return globalForDimOffersSql.dimOffersSqlClient;
  }

  const env = getClickhouseEnv();

  if (!env) {
    return null;
  }

  const { url, username, password } = resolveCredentials(env);

  globalForDimOffersSql.dimOffersSqlClient = createClient({
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

  return globalForDimOffersSql.dimOffersSqlClient;
}

/**
 * Validates that the statement is a single read-only SELECT/CTE and rejects
 * anything containing forbidden verbs, table functions, or references to
 * ClickHouse metadata schemas. Returns the cleaned statement or an error
 * message for the agent to self-correct on.
 */
export function validateReadOnlySql(
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
      error: `Forbidden schema reference "${forbiddenSchema[0].trim()}" — query only the data-quality tables (dim_offers, transaction_details, apidata_replica.dim_items).`,
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

/** Executes a validated read-only query with row cap + execution timeout. */
export async function runReadOnlyDimOffersQuery(
  sql: string,
): Promise<DimOffersSqlResult> {
  const validation = validateReadOnlySql(sql);

  if (!validation.ok) {
    console.warn(`[dim-offers-sql] rejected: ${validation.error}\n${sql}`);
    return { ok: false, error: validation.error };
  }

  const client = getClient();

  if (!client) {
    return {
      ok: false,
      error:
        "The data-quality ClickHouse database is not configured (CLICKHOUSE_URL is missing).",
    };
  }

  console.log(`[dim-offers-sql] query:\n${validation.sql}`);

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
      `[dim-offers-sql] ${limited.length} row(s) in ${Date.now() - startedAt}ms${
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
      `[dim-offers-sql] failed in ${Date.now() - startedAt}ms: ${message}`,
    );
    return { ok: false, error: `Query failed: ${message}` };
  }
}

export const queryDimOffersSql = createTool({
  id: "query-dim-offers-sql",
  description:
    "Run a single read-only ClickHouse SELECT query against the offers pricing data " +
    "(table dim_offers = current offer pricing per item_code: channel, category, subcategory, " +
    "ideal_price, selling_price, fc_perc, mktg_spend, discount_amount; plus transaction_details and " +
    "apidata_replica.dim_items for item context / brand). " +
    `Returns at most ${MAX_ROWS} rows — use aggregations (sum, count, GROUP BY) for totals instead of fetching raw rows.`,
  inputSchema: z.object({
    sql: z
      .string()
      .describe(
        "A single ClickHouse SELECT statement. Use unqualified names for the " +
          "default-database tables (dim_offers, transaction_details) and the " +
          "qualified name apidata_replica.dim_items for the item dimension, e.g. " +
          "SELECT count() FROM dim_offers WHERE ideal_price = 0.",
      ),
  }),
  execute: async ({ sql }) => {
    return runReadOnlyDimOffersQuery(sql);
  },
});
