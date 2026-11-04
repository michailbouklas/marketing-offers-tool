import { getMssqlPool, sql } from "$lib/server/mssql";
import type { SapItem, SapItemSearch } from "$lib/services/recipes";

const SEARCH_LIMIT = 50;
// SQL Server allows 2100 parameters per request; each key uses two.
const KEY_CHUNK = 1000;

const SELECT_COLUMNS = `
  databaseId, companyname, item_number, item_description, Inactive,
  purchasing_uom, stock_uom, item_group, item_sub_category,
  item_cost, last_purchase_price`;

type SapRow = {
  databaseId: string;
  companyname: string;
  item_number: string;
  item_description: string;
  Inactive: string | null;
  purchasing_uom: string | null;
  stock_uom: string | null;
  item_group: string;
  item_sub_category: string | null;
  item_cost: number | null;
  last_purchase_price: number | null;
};

function toSapItem(row: SapRow): SapItem {
  const cost = row.item_cost === null ? null : Number(row.item_cost);
  return {
    database_id: row.databaseId.trim(),
    companyname: row.companyname.trim(),
    item_number: row.item_number.trim(),
    item_description: row.item_description.trim(),
    inactive: row.Inactive === "Y",
    purchasing_uom: row.purchasing_uom?.trim() ?? "",
    stock_uom: row.stock_uom?.trim() ?? "",
    item_group: row.item_group.trim(),
    item_sub_category: row.item_sub_category?.trim() ?? "",
    // SAP stores "no cost" as 0 as often as NULL; both mean unknown here.
    item_cost: cost ? cost : null,
    last_purchase_price:
      row.last_purchase_price === null ? null : Number(row.last_purchase_price),
  };
}

export const sapItemKey = (item: {
  database_id: string;
  item_number: string;
}) => `${item.database_id}|${item.item_number}`;

let companiesCache: { at: number; names: string[] } | null = null;

/** Distinct `companyname` values (cached 10 min; the list is tiny). */
export async function listSapCompanies(): Promise<string[]> {
  if (companiesCache && Date.now() - companiesCache.at < 600_000) {
    return companiesCache.names;
  }
  const pool = await getMssqlPool();
  const result = await pool
    .request()
    .query<{
      companyname: string;
    }>("SELECT DISTINCT companyname FROM dbo.sapbw_items ORDER BY companyname");
  const names = result.recordset.map((row) => row.companyname.trim());
  companiesCache = { at: Date.now(), names };
  return names;
}

/**
 * The SAP company a brand's materials come from: `brand.sap_company_name` when
 * the warehouse holds that company, otherwise null (= search every company).
 * As of 2026-11-04 the warehouse only holds PHC_EUR, so non-PHC brands fall
 * back to all companies instead of finding nothing.
 */
export async function resolveSapCompany(
  sapCompanyName: string | null | undefined,
): Promise<string | null> {
  const wanted = sapCompanyName?.trim().toLowerCase();
  if (!wanted) return null;
  const companies = await listSapCompanies();
  return companies.find((name) => name.toLowerCase() === wanted) ?? null;
}

export async function searchSapItems(
  filters: SapItemSearch & { includeInactive?: boolean },
): Promise<SapItem[]> {
  const pool = await getMssqlPool();
  const request = pool.request().input("limit", sql.Int, SEARCH_LIMIT);
  const where: string[] = [];

  if (filters.item_number) {
    request.input("item_number", sql.NVarChar(50), filters.item_number);
    where.push(
      filters.exact
        ? "item_number = @item_number"
        : "item_number LIKE @item_number + '%'",
    );
  }
  if (filters.item_description) {
    request.input(
      "item_description",
      sql.NVarChar(200),
      filters.item_description,
    );
    where.push("item_description LIKE '%' + @item_description + '%'");
  }
  if (filters.companyname) {
    request.input("companyname", sql.VarChar(37), filters.companyname);
    where.push("companyname = @companyname");
  }
  if (filters.item_group) {
    request.input("item_group", sql.NVarChar(100), filters.item_group);
    where.push("item_group LIKE '%' + @item_group + '%'");
  }
  if (filters.item_sub_category) {
    request.input(
      "item_sub_category",
      sql.NVarChar(50),
      filters.item_sub_category,
    );
    where.push("item_sub_category LIKE '%' + @item_sub_category + '%'");
  }
  if (!filters.includeInactive) {
    where.push("ISNULL(Inactive, 'N') <> 'Y'");
  }

  const result = await request.query<SapRow>(`
    SELECT TOP (@limit) ${SELECT_COLUMNS}
    FROM dbo.sapbw_items
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY item_description`);

  return result.recordset.map(toSapItem);
}

/** Exact rows for the given keys (inactive included), keyed by `sapItemKey`. */
export async function getSapItemsByKey(
  keys: { database_id: string; item_number: string }[],
): Promise<Map<string, SapItem>> {
  const unique = [
    ...new Map(keys.map((key) => [sapItemKey(key), key])).values(),
  ];
  const items = new Map<string, SapItem>();
  if (unique.length === 0) return items;

  const pool = await getMssqlPool();
  for (let start = 0; start < unique.length; start += KEY_CHUNK) {
    const chunk = unique.slice(start, start + KEY_CHUNK);
    const request = pool.request();
    const clauses = chunk.map((key, index) => {
      request.input(`d${index}`, sql.VarChar(7), key.database_id);
      request.input(`n${index}`, sql.NVarChar(50), key.item_number);
      return `(databaseId = @d${index} AND item_number = @n${index})`;
    });
    const result = await request.query<SapRow>(
      `SELECT ${SELECT_COLUMNS} FROM dbo.sapbw_items WHERE ${clauses.join(" OR ")}`,
    );
    for (const row of result.recordset) {
      const item = toSapItem(row);
      items.set(sapItemKey(item), item);
    }
  }
  return items;
}
