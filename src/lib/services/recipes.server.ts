import { error, type RequestEvent } from "@sveltejs/kit";
import { adminRoles, hasAnyRole } from "$lib/auth/roles";
import { getAuthenticatedUserRole } from "$lib/server/auth-guards";
import { clickhouse } from "$lib/server/clickhouse";
import { prisma } from "$lib/server/prisma";
import {
  costRecipe,
  type ComboComponent,
  type ComboRange,
  type RecipeForm,
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
        AND trde_item IN ({codes:Array(String)})
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

/** Bound into every combo query; `to` is inclusive. */
const COMBO_WHERE = `lower(brand) = {alias:String}
  AND trde_date BETWEEN {from:Date} AND {to:Date}
  AND trde_void_time = ''
  AND trde_item != '-1'`;

export type ComboSummary = {
  code: string;
  /** Combos sold: the combo's own self-referencing head lines. */
  sold: number;
  /** Net of the combo and every line hanging off it. */
  net: number;
  componentItems: number;
};

/**
 * The brand's combos in the range. No master table marks combos, and
 * `trde_combo_item` alone does not either: standalone lines point at
 * themselves. A code is a combo when another item points at it as its own
 * line (`trde_combo_item = code`, `trde_item != code`, head line); items whose
 * only children are sub-line modifiers (a Whopper with "no pickles") are not.
 * Names and categories come from `dim_items` via `listMenuItems`.
 * Verified 2026-11-05: BK 122 combos in 90 days, all present in dim_items.
 */
export async function listCombos(
  alias: string,
  range: ComboRange,
): Promise<ComboSummary[]> {
  const result = await clickhouse.query({
    query: `
      SELECT trde_combo_item AS combo_code,
        toFloat64(sumIf(trde_qty, trde_item = trde_combo_item AND trde_sub_line = 0)) AS combos_sold,
        toFloat64(sum(trde_net_value)) AS combo_net,
        uniqExactIf(trde_item, trde_item != trde_combo_item) AS component_items
      FROM transaction_details
      WHERE ${COMBO_WHERE}
      GROUP BY trde_combo_item
      HAVING countIf(trde_item != trde_combo_item AND trde_sub_line = 0) > 0
        AND combos_sold > 0
      ORDER BY combos_sold DESC
    `,
    query_params: { alias: alias.toLowerCase(), ...range },
    format: "JSONEachRow",
  });
  const rows = await result.json<{
    combo_code: string;
    combos_sold: number;
    combo_net: number;
    component_items: number | string;
  }>();
  return rows.map((row) => ({
    code: row.combo_code,
    sold: Number(row.combos_sold),
    net: Number(row.combo_net),
    componentItems: Number(row.component_items),
  }));
}

/**
 * Average components of each combo (see `listCombos` for the rule), or of
 * one combo when `comboCode` is set. Components are every line pointing at
 * the combo, head lines and sub-lines alike: BK records meal drinks as
 * sub-lines of the fries. Paid extras added inside the combo are included,
 * so a cost built from this is an upper bound for the bare combo.
 * shortcut: combos not sold in the range are not recognised.
 */
export async function listComboComponents(
  alias: string,
  range: ComboRange,
  comboCode?: string,
): Promise<Map<string, ComboComponent[]>> {
  const combos = new Map(
    (await listCombos(alias, range))
      .filter((combo) => !comboCode || combo.code === comboCode)
      .map((combo) => [combo.code, combo.sold]),
  );
  const result = new Map<string, ComboComponent[]>();
  if (combos.size === 0) return result;

  const rows = await (
    await clickhouse.query({
      query: `
        SELECT trde_combo_item AS combo_code, trde_item AS component_code,
          any(item_name) AS component_name,
          toFloat64(sum(trde_qty)) AS component_qty,
          toFloat64(sum(trde_net_value)) AS component_net
        FROM transaction_details
        WHERE ${COMBO_WHERE}
          AND trde_combo_item IN {codes:Array(String)}
          AND trde_item != trde_combo_item
        GROUP BY trde_combo_item, trde_item
      `,
      query_params: {
        alias: alias.toLowerCase(),
        ...range,
        codes: [...combos.keys()],
      },
      format: "JSONEachRow",
    })
  ).json<{
    combo_code: string;
    component_code: string;
    component_name: string;
    component_qty: number;
    component_net: number;
  }>();

  for (const row of rows) {
    const sold = combos.get(row.combo_code)!;
    const components = result.get(row.combo_code) ?? [];
    components.push({
      item_code: row.component_code,
      name: row.component_name,
      perCombo: Number(row.component_qty) / sold,
      qty: Number(row.component_qty),
      net: Number(row.component_net),
    });
    result.set(row.combo_code, components);
  }
  for (const components of result.values()) {
    components.sort((a, b) => b.perCombo - a.perCombo);
  }
  return result;
}

type LineKey = { database_id: string; item_number: string };

/** Live cost of each brand recipe, keyed by item_code. */
export async function listRecipeCosts(brandId: number) {
  const recipes = await prisma.recipe.findMany({
    where: { brandId },
    select: {
      item_code: true,
      updated_at: true,
      lines: {
        select: { database_id: true, item_number: true, quantity: true },
      },
    },
  });
  const sapItems = await getSapItemsByKey(recipes.flatMap((r) => r.lines));

  return new Map(
    recipes.map((recipe) => [
      recipe.item_code,
      {
        lineCount: recipe.lines.length,
        updated_at: recipe.updated_at,
        ...costRecipe(
          recipe.lines.map((line) => ({
            quantity: Number(line.quantity),
            unit_cost: sapItems.get(sapItemKey(line))?.item_cost ?? null,
          })),
        ),
      },
    ]),
  );
}

export type RecipeLineView = {
  database_id: string;
  item_number: string;
  quantity: number;
  /** Live SAP row; null when the item no longer exists in SAP. */
  sap: SapItem | null;
  saved_description: string;
  saved_uom: string;
};

export async function getRecipe(brandId: number, itemCode: string) {
  const recipe = await prisma.recipe.findUnique({
    where: { brandId_item_code: { brandId, item_code: itemCode } },
    include: { lines: { orderBy: { sort_order: "asc" } } },
  });
  if (!recipe) return null;

  const sapItems = await getSapItemsByKey(recipe.lines);
  const lines: RecipeLineView[] = recipe.lines.map((line) => ({
    database_id: line.database_id,
    item_number: line.item_number,
    quantity: Number(line.quantity),
    sap: sapItems.get(sapItemKey(line)) ?? null,
    saved_description: line.item_description,
    saved_uom: line.uom,
  }));

  return {
    updated_at: recipe.updated_at,
    updated_by: recipe.updated_by,
    lines,
  };
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
    getSapItemsByKey(lines),
  ]);
  const errors: Record<number, string> = {};
  const seen = new Set<string>();

  lines.forEach((line, index) => {
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

export async function saveRecipe(input: {
  brandId: number;
  itemCode: string;
  /** Undefined when the item left the menu: keep the stored description. */
  itemDescription: string | undefined;
  userId: string;
  lines: RecipeForm["lines"];
  sapItems: Map<string, SapItem>;
}) {
  await prisma.$transaction(async (tx) => {
    const recipe = await tx.recipe.upsert({
      where: {
        brandId_item_code: {
          brandId: input.brandId,
          item_code: input.itemCode,
        },
      },
      create: {
        brandId: input.brandId,
        item_code: input.itemCode,
        item_description: input.itemDescription ?? "",
        updated_by: input.userId,
      },
      update: {
        item_description: input.itemDescription,
        updated_by: input.userId,
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
          item_description: sap?.item_description ?? "",
          uom: sap?.purchasing_uom ?? "",
          quantity: line.quantity,
          unit_cost_snapshot: sap?.item_cost ?? null,
        };
      }),
    });
  });
}
