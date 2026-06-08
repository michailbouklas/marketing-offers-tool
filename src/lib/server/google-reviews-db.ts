import { env } from "$env/dynamic/private";

/**
 * Helpers for querying the google-maps-scraper ClickHouse replica. The replica
 * lives in a different database than the connection default
 * (`CLICKHOUSE_DATABASE`), so every table reference is fully qualified with
 * the database resolved here — mirroring the competition replica pattern
 * (`$lib/server/competition-db`).
 *
 * All replica tables are `ReplacingMergeTree(_version)`; queries must use
 * `FINAL` to read deduplicated rows. `_sign` / `_version` are MATERIALIZED
 * columns and never appear in `SELECT *` results.
 */

const DEFAULT_GOOGLE_REVIEWS_DATABASE = "google_maps_scraper_replica";

// The database name is interpolated into query strings (identifiers cannot be
// bound as query_params), so it must be a strict identifier to rule out any
// env-based SQL injection.
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_]+$/;

let cachedDatabase: string | null = null;

export function getGoogleReviewsDatabase() {
  if (cachedDatabase) {
    return cachedDatabase;
  }

  const database =
    env.CLICKHOUSE_GOOGLE_REVIEWS_DATABASE || DEFAULT_GOOGLE_REVIEWS_DATABASE;

  if (!IDENTIFIER_PATTERN.test(database)) {
    throw new Error(
      `Invalid CLICKHOUSE_GOOGLE_REVIEWS_DATABASE: must match ${IDENTIFIER_PATTERN}`,
    );
  }

  cachedDatabase = database;

  return database;
}

/**
 * Fully qualified table reference for query strings. Callers must append
 * `FINAL` after the alias (`FROM <table> AS t FINAL`) — ClickHouse rejects
 * `FINAL` before `AS`.
 */
export function googleReviewsTable(table: string) {
  return `${getGoogleReviewsDatabase()}.${table}`;
}

/** Decimal columns arrive as strings over JSONEachRow. */
export function parseNullableNumber(value: string | number | null | undefined) {
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

export function parseCount(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildWhereClause(filterClauses: string[]) {
  return filterClauses.length > 0 ? `WHERE ${filterClauses.join(" AND ")}` : "";
}

/**
 * `DateTime64(6)` columns are stored as UTC wall-clock values with no
 * timezone; selecting them through this expression yields an explicit UTC ISO
 * string the browser can hand to `new Date(...)`. Note `%i` is minutes in
 * ClickHouse's formatDateTime (`%M` is the month name).
 */
export function utcIsoExpression(column: string) {
  return `formatDateTime(${column}, '%Y-%m-%dT%H:%i:%SZ')`;
}
