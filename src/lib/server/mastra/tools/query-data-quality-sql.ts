import { createTool } from "@mastra/core/tools";
import { Pool } from "pg";
import { z } from "zod";
import { getDatabaseUrl } from "../env";

const MAX_ROWS = 200;
const STATEMENT_TIMEOUT_MS = 15_000;

/**
 * Verbs/functions that must never appear in agent-generated SQL. The query
 * additionally runs inside a `READ ONLY` transaction, so this list is a
 * first line of defense with a clearer error message, not the only barrier.
 */
const FORBIDDEN_PATTERN =
  /\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|copy|call|do|execute|prepare|deallocate|listen|notify|reindex|cluster|vacuum|lock|set|reset|pg_sleep|pg_terminate_backend|pg_cancel_backend|pg_read_file|pg_write_file|lo_import|lo_export|dblink)\b/i;

/** Postgres OIDs whose values `pg` returns as strings to preserve precision. */
const INT8_OID = 20;
const NUMERIC_OID = 1700;

export type DataQualitySqlResult =
  | {
      ok: true;
      rowCount: number;
      /** True when the query matched more than MAX_ROWS rows. */
      truncated: boolean;
      rows: Record<string, unknown>[];
    }
  | { ok: false; error: string };

const globalForDataQualitySql = globalThis as typeof globalThis & {
  dataQualitySqlPool?: Pool;
};

/**
 * Dedicated tiny pool instead of the app's Prisma client: the tool only runs
 * raw SQL, and skipping Prisma keeps the whole mastra directory free of
 * SvelteKit virtual modules so `mastra dev` (playground) can bundle it.
 */
function getPool(): Pool {
  globalForDataQualitySql.dataQualitySqlPool ??= new Pool({
    connectionString: getDatabaseUrl(),
    max: 3,
  });

  return globalForDataQualitySql.dataQualitySqlPool;
}

/** Coerce Date/BigInt (and stringified int8/numeric) cells for JSON output. */
function toSerializable(value: unknown, dataTypeId?: number): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  // pg returns count()/sums as strings to avoid precision loss; numbers are
  // friendlier for the model (and any loss is irrelevant for chat display).
  if (
    typeof value === "string" &&
    (dataTypeId === INT8_OID || dataTypeId === NUMERIC_OID)
  ) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }

  return value;
}

/**
 * Validates that the statement is a single read-only SELECT/CTE and rejects
 * anything containing forbidden verbs. Returns the cleaned statement or an
 * error message for the agent to self-correct on.
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

  return { ok: true, sql: cleaned };
}

/** Executes a validated read-only query with row cap + statement timeout. */
export async function runReadOnlyDataQualityQuery(
  sql: string,
): Promise<DataQualitySqlResult> {
  const validation = validateReadOnlySql(sql);

  if (!validation.ok) {
    console.warn(`[data-quality-sql] rejected: ${validation.error}\n${sql}`);
    return { ok: false, error: validation.error };
  }

  console.log(`[data-quality-sql] query:\n${validation.sql}`);

  // Row cap is enforced by wrapping, so agent-written LIMITs are optional.
  const wrapped = `SELECT * FROM (${validation.sql}) AS agent_query LIMIT ${MAX_ROWS + 1}`;
  const startedAt = Date.now();
  const client = await getPool().connect();

  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const result = await client.query(wrapped);
    await client.query("COMMIT");

    const typeByColumn = new Map(
      result.fields.map((field) => [field.name, field.dataTypeID]),
    );
    const truncated = result.rows.length > MAX_ROWS;
    const limited = truncated ? result.rows.slice(0, MAX_ROWS) : result.rows;

    console.log(
      `[data-quality-sql] ${limited.length} row(s) in ${Date.now() - startedAt}ms${
        truncated ? " (truncated)" : ""
      }`,
    );

    return {
      ok: true,
      rowCount: limited.length,
      truncated,
      rows: limited.map((row: Record<string, unknown>) =>
        Object.fromEntries(
          Object.entries(row).map(([column, cell]) => [
            column,
            toSerializable(cell, typeByColumn.get(column)),
          ]),
        ),
      ),
    };
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => {});
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(
      `[data-quality-sql] failed in ${Date.now() - startedAt}ms: ${message}`,
    );
    return { ok: false, error: `Query failed: ${message}` };
  } finally {
    client.release();
  }
}

export const queryDataQualitySql = createTool({
  id: "query-data-quality-sql",
  description:
    "Run a single read-only SQL SELECT query against the offers data-quality PostgreSQL database " +
    "(tables dq_missing_offers_pricing = the pricing-gap queue, dim_offers_staging = submitted/approved/rejected " +
    "pricing submissions, and the channels / categories / subcategories lookup tables). " +
    `Returns at most ${MAX_ROWS} rows — use aggregations (SUM, COUNT, GROUP BY) for totals instead of fetching raw rows.`,
  inputSchema: z.object({
    sql: z
      .string()
      .describe(
        "A single PostgreSQL SELECT statement, e.g. " +
          "SELECT status, count(*) FROM dq_missing_offers_pricing GROUP BY status.",
      ),
  }),
  execute: async ({ sql }) => {
    return runReadOnlyDataQualityQuery(sql);
  },
});
