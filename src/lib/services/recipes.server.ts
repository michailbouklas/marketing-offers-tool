import { error, type RequestEvent } from "@sveltejs/kit";
import { adminRoles, hasAnyRole } from "$lib/auth/roles";
import { getAuthenticatedUserRole } from "$lib/server/auth-guards";
import { clickhouse } from "$lib/server/clickhouse";
import { prisma } from "$lib/server/prisma";
import type { ImportLine } from "$lib/services/recipe-import";
import {
  buildRecipeRows,
  costRecipe,
  type SapItem,
} from "$lib/services/recipes";
import {
  getSapItemsByKey,
  resolveSapCompany,
  sapItemKey,
} from "$lib/services/sap-items.server";

export type RecipeBrand = {
  id: number;
  name: string;
  /** Equals `apidata_replica.dim_items.tablename`. */
  alias: string;
  sap_company_name: string | null;
  /** Yearly food-cost target as a fraction (0.30 = 30%), null when unset. */
  ideal_fc_perc: number | null;
  /** Labour cost target as a fraction of ex-VAT net sales, null when unset. */
  labour_perc: number | null;
};

export type MenuItem = {
  item_code: string;
  description: string;
  category: string;
  subcategory: string;
  price: number;
  /** Latest dim_items row has item_active = 1. */
  active: boolean;
};

/**
 * Brands the user may build recipes for: admin/superUser see every active
 * brand, everyone else (brandManager) only their `user_brand` assignments.
 * Same rule as `listScopedBrands`; always derived server-side.
 */
export async function listRecipeBrands(
  event: RequestEvent,
): Promise<RecipeBrand[]> {
  const user = event.locals.user;
  if (!user) return [];
  const isAdmin = hasAnyRole(await getAuthenticatedUserRole(event), adminRoles);

  const brands = await prisma.brand.findMany({
    where: {
      active: true,
      ...(isAdmin ? {} : { user_assignments: { some: { userId: user.id } } }),
    },
    select: {
      id: true,
      name: true,
      alias: true,
      sap_company_name: true,
      ideal_fc_perc: true,
      labour_perc: true,
    },
    orderBy: { name: "asc" },
  });

  return brands
    .map((brand) => ({
      ...brand,
      name: brand.name.trim(),
      alias: brand.alias.trim(),
      ideal_fc_perc:
        brand.ideal_fc_perc === null ? null : Number(brand.ideal_fc_perc),
      labour_perc:
        brand.labour_perc === null ? null : Number(brand.labour_perc),
    }))
    .filter((brand) => brand.alias.length > 0);
}

/** Resolves `alias` against the user's allowed brands, 404 otherwise. */
export async function requireRecipeBrand(
  event: RequestEvent,
  alias: string,
): Promise<{ brand: RecipeBrand; brands: RecipeBrand[] }> {
  const brands = await listRecipeBrands(event);
  const brand = brands.find((candidate) => candidate.alias === alias);
  if (!brand) error(404, "Brand not found");
  return { brand, brands };
}

export async function listMenuItems(alias: string): Promise<MenuItem[]> {
  // dim_items repeats each item_code ~100+ times per brand: FINAL + GROUP BY.
  // Aliases differ from column names on purpose (ClickHouse alias substitution
  // would otherwise turn the WHERE filters into aggregates).
  const result = await clickhouse.query({
    query: `
      SELECT
        item_code,
        argMax(item_description, id) AS menu_description,
        argMax(ifNull(item_category, ''), id) AS menu_category,
        argMax(ifNull(item_subcategory, ''), id) AS menu_subcategory,
        toFloat64(argMax(item_price, id)) AS menu_price,
        argMax(ifNull(item_active, 0), id) = 1 AS menu_active
      FROM apidata_replica.dim_items FINAL
      WHERE tablename = {alias:String}
        AND item_code IS NOT NULL
        AND ifNull(item_category, '') != 'INTERNAL USE'
      GROUP BY item_code
      ORDER BY menu_category, menu_description
    `,
    query_params: { alias },
    format: "JSONEachRow",
  });

  const rows = await result.json<{
    item_code: string;
    menu_description: string | null;
    menu_category: string;
    menu_subcategory: string;
    menu_price: number;
    menu_active: boolean | number;
  }>();

  return rows.map((row) => ({
    item_code: row.item_code,
    description: row.menu_description ?? "",
    category: row.menu_category,
    subcategory: row.menu_subcategory,
    price: Number(row.menu_price),
    active: Boolean(row.menu_active),
  }));
}

export async function getMenuItem(
  alias: string,
  itemCode: string,
): Promise<MenuItem | null> {
  const items = await listMenuItems(alias);
  return items.find((item) => item.item_code === itemCode) ?? null;
}

/**
 * Units sold and net sales per item over the last `days` days, from POS
 * `transaction_details`. Only head lines (`trde_sub_line = 0`) count: sub-lines
 * are modifiers/components, not items the guest ordered from the menu.
 * Voided lines and orders without a `transactions` header (staff meals, some
 * walk-ins; the POS leaves them out) do not count.
 */
export async function listItemSales(
  alias: string,
  itemCodes: string[],
  days: number,
): Promise<Map<string, { units: number; net: number }>> {
  if (itemCodes.length === 0) return new Map();

  const result = await clickhouse.query({
    query: `
      SELECT
        trde_item,
        sum(trde_qty) AS sold_units,
        toFloat64(sum(trde_net_value)) AS sold_net
      FROM transaction_details
      WHERE lower(brand) = {alias:String}
        AND trde_date >= today() - {days:UInt16}
        AND trde_sub_line = 0
        AND trde_void_time = ''
        AND trde_item IN ({codes:Array(String)})
        AND (trde_date, trde_location, trde_division, trde_no) IN (
          SELECT tran_date, tran_location, tran_division, tran_no
          FROM transactions
          WHERE lower(brand) = {alias:String}
            AND tran_date >= today() - {days:UInt16})
      GROUP BY trde_item
    `,
    query_params: { alias: alias.toLowerCase(), days, codes: itemCodes },
    format: "JSONEachRow",
  });

  const rows = await result.json<{
    trde_item: string;
    sold_units: number | string;
    sold_net: number;
  }>();

  return new Map(
    rows.map((row) => [
      row.trde_item,
      { units: Number(row.sold_units), net: Number(row.sold_net) },
    ]),
  );
}

type LineKey = { database_id: string; item_number: string };

/**
 * Every brand recipe with its live cost, including imported ones that are not
 * linked to a POS item (`item_code` null).
 */
export async function listRecipeItems(brandId: number) {
  const recipes = await prisma.recipe.findMany({
    where: { brandId },
    select: {
      id: true,
      item_code: true,
      import_name: true,
      item_description: true,
      updated_at: true,
      lines: {
        select: { database_id: true, item_number: true, quantity: true },
      },
    },
    orderBy: { item_description: "asc" },
  });
  // Lines the import could not resolve carry no database id: nothing to look up.
  const sapItems = await getSapItemsByKey(
    recipes.flatMap((r) => r.lines).filter((line) => line.database_id),
  );

  return recipes.map((recipe) => ({
    id: recipe.id,
    item_code: recipe.item_code,
    name: recipe.import_name ?? recipe.item_description,
    lineCount: recipe.lines.length,
    updated_at: recipe.updated_at,
    ...costRecipe(
      recipe.lines.map((line) => ({
        quantity: Number(line.quantity),
        unit_cost: sapItems.get(sapItemKey(line))?.item_cost ?? null,
      })),
    ),
  }));
}

/**
 * Every brand recipe joined to its POS item, plus the POS items that have no
 * recipe yet: the rows of the `/admin/recipes` grid and of its Excel export.
 */
export async function listRecipeRows(brand: RecipeBrand) {
  const [menu, recipes] = await Promise.all([
    listMenuItems(brand.alias),
    listRecipeItems(brand.id),
  ]);
  return buildRecipeRows(menu, recipes);
}

/** Live cost of each brand recipe linked to a POS item, keyed by item_code. */
export async function listRecipeCosts(brandId: number) {
  const costs = new Map<
    string,
    { lineCount: number; updated_at: Date; total: number; missing: number }
  >();
  for (const recipe of await listRecipeItems(brandId)) {
    if (recipe.item_code === null) continue;
    const { lineCount, updated_at, total, missing } = recipe;
    costs.set(recipe.item_code, { lineCount, updated_at, total, missing });
  }
  return costs;
}

export type RecipeLineView = {
  database_id: string;
  item_number: string;
  /** In the SAP purchasing UoM: the cost basis. */
  quantity: number;
  /** Workbook recipe-unit quantity; null on hand-built recipes. */
  recipe_quantity: number | null;
  /** Live SAP row; null when SAP does not (or no longer) know the item. */
  sap: SapItem | null;
  saved_description: string;
  saved_uom: string;
};

const withLines = { lines: { orderBy: { sort_order: "asc" } } } as const;

async function recipeView(
  recipe: Awaited<
    ReturnType<typeof prisma.recipe.findFirst<{ include: typeof withLines }>>
  >,
) {
  if (!recipe) return null;

  const sapItems = await getSapItemsByKey(
    recipe.lines.filter((line) => line.database_id),
  );
  const lines: RecipeLineView[] = recipe.lines.map((line) => ({
    database_id: line.database_id,
    item_number: line.item_number,
    quantity: Number(line.quantity),
    recipe_quantity:
      line.recipe_quantity === null ? null : Number(line.recipe_quantity),
    sap: sapItems.get(sapItemKey(line)) ?? null,
    saved_description: line.item_description,
    saved_uom: line.uom,
  }));

  return {
    id: recipe.id,
    brandId: recipe.brandId,
    item_code: recipe.item_code,
    import_name: recipe.import_name,
    /** Workbook name, else the POS description stored at the last save. */
    name: recipe.import_name ?? recipe.item_description,
    updated_at: recipe.updated_at,
    updated_by: recipe.updated_by,
    lines,
  };
}

export async function getRecipe(brandId: number, itemCode: string) {
  return recipeView(
    await prisma.recipe.findUnique({
      where: { brandId_item_code: { brandId, item_code: itemCode } },
      include: withLines,
    }),
  );
}

/** By primary key; the caller checks `brandId` against the user's brands. */
export async function getRecipeById(id: number) {
  return recipeView(
    await prisma.recipe.findUnique({ where: { id }, include: withLines }),
  );
}

/**
 * Re-checks every line against SAP (the client is not trusted): the item must
 * exist and, when the brand maps to a warehouse company, belong to it.
 * Returns per-line error messages keyed by line index.
 */
export async function validateRecipeLines(
  brand: RecipeBrand,
  lines: LineKey[],
): Promise<{ errors: Record<number, string>; sapItems: Map<string, SapItem> }> {
  const [company, sapItems] = await Promise.all([
    resolveSapCompany(brand.sap_company_name),
    getSapItemsByKey(lines.filter((line) => line.database_id)),
  ]);
  const errors: Record<number, string> = {};
  const seen = new Set<string>();

  lines.forEach((line, index) => {
    // No SAP company: a kept workbook material, judged by `mergeStoredLines`.
    if (!line.database_id) return;
    const key = sapItemKey(line);
    const item = sapItems.get(key);
    if (!item) {
      errors[index] = `Item ${line.item_number} not found in SAP`;
    } else if (company && item.companyname !== company) {
      errors[index] =
        `Item ${line.item_number} belongs to ${item.companyname}, not ${company}`;
    } else if (seen.has(key)) {
      errors[index] = `Item ${line.item_number} is listed twice`;
    }
    seen.add(key);
  });

  return { errors, sapItems };
}

/**
 * Updates recipe `recipeId` (or creates one when null) and replaces its lines;
 * returns its id. Which stored recipe an import updates is decided by the
 * caller (`matchStoredRecipe`).
 */
export async function saveRecipe(input: {
  brandId: number;
  /** The stored recipe to update; null creates a new one. */
  recipeId: number | null;
  /** Null = imported recipe with no POS item (needs `importName`). */
  itemCode: string | null;
  importName?: string;
  /** Undefined when the item left the menu: keep the stored description. */
  itemDescription: string | undefined;
  userId: string;
  lines: ImportLine[];
  sapItems: Map<string, SapItem>;
}) {
  const { brandId, itemCode, importName } = input;
  return prisma.$transaction(async (tx) => {
    const target = input.recipeId
      ? await tx.recipe.findUnique({ where: { id: input.recipeId } })
      : null;
    const byCode = itemCode
      ? await tx.recipe.findUnique({
          where: { brandId_item_code: { brandId, item_code: itemCode } },
        })
      : null;
    // Never unlink, and never take a POS code another recipe holds (unique
    // per brand): this one then keeps whatever link it had.
    const item_code =
      byCode && byCode.id !== target?.id
        ? (target?.item_code ?? null)
        : (itemCode ?? target?.item_code ?? null);
    // The workbook name is unique per brand: a duplicate holding it lets go
    // (the import lists that duplicate for deletion).
    if (importName) {
      await tx.recipe.updateMany({
        where: {
          brandId,
          import_name: importName,
          ...(target && { id: { not: target.id } }),
        },
        data: { import_name: null },
      });
    }

    const data = {
      item_code,
      import_name: importName,
      item_description: input.itemDescription,
      updated_by: input.userId,
    };
    const recipe = target
      ? await tx.recipe.update({ where: { id: target.id }, data })
      : await tx.recipe.create({
          data: {
            ...data,
            brandId,
            item_description: input.itemDescription ?? "",
          },
        });

    await tx.recipe_line.deleteMany({ where: { recipeId: recipe.id } });
    await tx.recipe_line.createMany({
      data: input.lines.map((line, index) => {
        const sap = input.sapItems.get(sapItemKey(line));
        return {
          recipeId: recipe.id,
          sort_order: index,
          database_id: line.database_id,
          item_number: line.item_number,
          item_description: sap?.item_description ?? line.description ?? "",
          uom: sap?.purchasing_uom ?? line.uom ?? "",
          quantity: line.quantity,
          recipe_quantity: line.recipe_quantity ?? null,
          unit_cost_snapshot: sap?.item_cost ?? null,
        };
      }),
    });
    return recipe.id;
  });
}
