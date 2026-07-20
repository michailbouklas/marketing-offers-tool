import { clickhouse } from "$lib/server/clickhouse";
import { prisma } from "$lib/server/prisma";

// The invoice header tables (`api_WOLT_header` / `api_BOLT_header`) carry only
// a store-level `project` code with no relation to the Postgres `brand` table.
// The linkage goes through ClickHouse: `brand.sap_brand_alias` matches
// `apidata_replica.dim_store.brand_alias`, and `dim_store."BI unique code"`
// matches `api_*_header.project`. One brand maps to many stores/project codes.

interface CacheEntry {
  at: number;
  codes: string[];
}

const TTL_MS = 5 * 60 * 1000; // dim_store changes rarely; page reloads on every filter keystroke.
const cache = new Map<string, CacheEntry>();

/**
 * Resolves a SAP brand alias to the distinct `dim_store."BI unique code"`
 * values (i.e. the `project` codes used on aggregator invoice headers).
 * Results are cached in memory for {@link TTL_MS}.
 */
export async function getProjectCodesForSapAlias(
  sapBrandAlias: string,
  options: { now?: number } = {},
): Promise<string[]> {
  const now = options.now ?? Date.now();
  const cached = cache.get(sapBrandAlias);

  if (cached && now - cached.at < TTL_MS) {
    return cached.codes;
  }

  const result = await clickhouse.query({
    query: `
      SELECT DISTINCT \`BI unique code\` AS code
      FROM apidata_replica.dim_store
      WHERE brand_alias = {brand_alias:String}
        AND notEmpty(\`BI unique code\`)
    `,
    query_params: {
      brand_alias: sapBrandAlias,
    },
    format: "JSONEachRow",
  });

  const rows = await result.json<{ code: string }>();
  const codes = rows.map((row) => row.code);

  cache.set(sapBrandAlias, { at: now, codes });

  return codes;
}

/**
 * Resolves a brand id to its invoice `project` codes.
 *
 * - Unknown brand id → `null` (callers should ignore the filter).
 * - Brand without a `sap_brand_alias`, or with no matching stores → `[]`
 *   (callers should match zero rows — the user explicitly picked the brand).
 */
export async function resolveBrandProjectCodes(
  brandId: number,
): Promise<string[] | null> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { sap_brand_alias: true },
  });

  if (!brand) {
    return null;
  }

  const sapBrandAlias = brand.sap_brand_alias?.trim();

  if (!sapBrandAlias) {
    return [];
  }

  return getProjectCodesForSapAlias(sapBrandAlias);
}

/** Test helper — resets the in-memory cache. */
export function __clearBrandProjectCodesCache(): void {
  cache.clear();
}
