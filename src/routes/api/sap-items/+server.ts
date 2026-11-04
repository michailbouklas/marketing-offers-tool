import { error, json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { sapItemSearchSchema } from "$lib/services/recipes";
import { listRecipeBrands } from "$lib/services/recipes.server";
import {
  resolveSapCompany,
  searchSapItems,
} from "$lib/services/sap-items.server";
import type { RequestHandler } from "./$types";

/**
 * GET /api/sap-items?brand=<alias>&item_number=&item_description=&companyname=&item_group=&item_sub_category=&exact=1
 *
 * Material search for the recipe builder. When the brand maps to a company
 * held in the warehouse the search is pinned to it (a client cannot widen it);
 * otherwise the optional `companyname` filter applies.
 */
export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { recipe: ["manage"] });

  const params = event.url.searchParams;
  const brand = (await listRecipeBrands(event)).find(
    (candidate) => candidate.alias === params.get("brand"),
  );
  if (!brand) error(404, "Brand not found");

  const parsed = sapItemSearchSchema.safeParse({
    item_number: params.get("item_number") || undefined,
    item_description: params.get("item_description") || undefined,
    companyname: params.get("companyname") || undefined,
    item_group: params.get("item_group") || undefined,
    item_sub_category: params.get("item_sub_category") || undefined,
    exact: params.get("exact") === "1",
  });
  if (!parsed.success) error(400, "Invalid search");

  const lockedCompany = await resolveSapCompany(brand.sap_company_name);
  const items = await searchSapItems({
    ...parsed.data,
    companyname: lockedCompany ?? parsed.data.companyname,
  });

  return json({ items });
};
