import { env } from "$env/dynamic/private";

/**
 * Helpers for querying the aggregator-scraper ClickHouse replica. The replica
 * lives in a different database than the connection default
 * (`CLICKHOUSE_DATABASE`), so every table reference is fully qualified with
 * the database resolved here — mirroring the existing cross-database pattern
 * (e.g. `apidata_replica.dim_items`).
 *
 * Schema reference: `docs/competition-scraper/clickhouse-schema.sql`. All
 * replica tables are `ReplacingMergeTree(_version) ORDER BY tuple(id)`; queries
 * must use `FINAL` to read deduplicated rows. `_sign` / `_version` are
 * MATERIALIZED columns and never appear in `SELECT *` results.
 *
 * The schema has no per-row price/currency columns: a product's price lives in
 * the `product_price` time-series, fetched as the latest value with
 * `argMax(price, recorded_at)` (see `LATEST_PRICE_SUBQUERY`). Currency is not
 * stored at all — `getCompetitionCurrency()` supplies it for formatting.
 */

const DEFAULT_COMPETITION_DATABASE = "aggregator_scraper_replica";

const DEFAULT_COMPETITION_CURRENCY = "EUR";

// The database name is interpolated into query strings (identifiers cannot be
// bound as query_params), so it must be a strict identifier to rule out any
// env-based SQL injection.
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_]+$/;

let cachedDatabase: string | null = null;

export function getCompetitionDatabase() {
  if (cachedDatabase) {
    return cachedDatabase;
  }

  const database =
    env.CLICKHOUSE_COMPETITION_DATABASE || DEFAULT_COMPETITION_DATABASE;

  if (!IDENTIFIER_PATTERN.test(database)) {
    throw new Error(
      `Invalid CLICKHOUSE_COMPETITION_DATABASE: must match ${IDENTIFIER_PATTERN}`,
    );
  }

  cachedDatabase = database;

  return database;
}

let cachedCurrency: string | null = null;

/**
 * The replica stores no currency. The aggregators are Cyprus-based (EUR by
 * default); override with `CLICKHOUSE_COMPETITION_CURRENCY`. Used only for
 * display formatting — attached to priced rows server-side.
 */
export function getCompetitionCurrency() {
  if (cachedCurrency) {
    return cachedCurrency;
  }

  cachedCurrency =
    env.CLICKHOUSE_COMPETITION_CURRENCY || DEFAULT_COMPETITION_CURRENCY;

  return cachedCurrency;
}

/**
 * Fully qualified table reference for query strings. Callers must append
 * `FINAL` after the alias (`FROM <table> AS t FINAL`) — ClickHouse rejects
 * `FINAL` before `AS`.
 */
export function competitionTable(table: string) {
  return `${getCompetitionDatabase()}.${table}`;
}

/**
 * Subquery yielding the latest *known* `price` per `product_id` from the
 * `product_price` time-series. Join it as `... AS pp ON pp.product_id = <id>`
 * and read `pp.price`. Pass an optional WHERE fragment (e.g.
 * `"product_id IN ({product_ids:Array(Int32)})"`) to scope it — always scope
 * it in list/menu queries so the aggregation stays bounded.
 *
 * `product_price.price` is nullable and the most recent reading is frequently
 * null (offer/promo products in particular), so `argMaxIf(..., price IS NOT
 * NULL)` is used instead of a plain `argMax`: it returns the latest reading
 * that actually carried a price, and only yields null when the product has
 * never had one.
 */
export function latestProductPriceSubquery(whereFragment?: string) {
  return `
    SELECT product_id, argMaxIf(price, recorded_at, price IS NOT NULL) AS price
    FROM ${competitionTable("product_price")} FINAL
    ${whereFragment ? `WHERE ${whereFragment}` : ""}
    GROUP BY product_id
  `;
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
