import { prisma } from "$lib/server/prisma";
import { Prisma } from "../../generated/prisma/client";
import {
  menuItemCost,
  netSellingPrice,
  sapKey,
  type MenuImportItem,
  type MenuImportResult,
  type MenuItemForm,
  type MenuItemRow,
  type RecipeOption,
} from "$lib/services/menu";
import { normalize } from "$lib/services/recipe-import";
import type { SapItem } from "$lib/services/recipes";
import {
  listRecipeRows,
  validateRecipeLines,
  type RecipeBrand,
} from "$lib/services/recipes.server";
import { getSapItemsByKey } from "$lib/services/sap-items.server";

/** The brand's stored recipes with live cost and POS price. */
export async function listRecipeOptions(
  brand: RecipeBrand,
): Promise<RecipeOption[]> {
  const rows = await listRecipeRows(brand);
  return rows.flatMap((row) =>
    row.id === null
      ? []
      : [
          {
            id: row.id,
            name: row.name,
            item_code: row.item_code,
            category: row.category,
            cost: row.cost ?? 0,
            missing: row.missing,
            price: row.price,
          },
        ],
  );
}

const withLines = {
  lines: {
    orderBy: { sort_order: "asc" },
    select: {
      recipeId: true,
      database_id: true,
      item_number: true,
      name: true,
      uom: true,
      quantity: true,
    },
  },
} satisfies Prisma.menu_itemInclude;

type StoredLine = {
  recipeId: number | null;
  database_id: string | null;
  item_number: string | null;
  name: string;
  uom: string;
  quantity: Prisma.Decimal;
};

/** Live SAP rows of the material lines, keyed `database_id|item_number`. */
async function materialsOf(lines: StoredLine[]) {
  const keys = lines.flatMap((line) =>
    line.item_number && line.database_id
      ? [{ database_id: line.database_id, item_number: line.item_number }]
      : [],
  );
  return keys.length ? getSapItemsByKey(keys) : new Map<string, SapItem>();
}

/** A line's display name; recipes use their current name. */
function lineName(line: StoredLine, recipes: Map<number, RecipeOption>) {
  if (line.item_number) return `${line.item_number} ${line.name}`;
  return (
    (line.recipeId !== null && recipes.get(line.recipeId)?.name) ||
    `${line.name} (deleted)`
  );
}

/** The menu table rows and the recipes they are costed from. */
export async function listBrandMenu(brand: RecipeBrand) {
  const [recipes, items] = await Promise.all([
    listRecipeOptions(brand),
    prisma.menu_item.findMany({
      where: { brandId: brand.id },
      include: withLines,
      orderBy: { name: "asc" },
    }),
  ]);
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const materials = await materialsOf(items.flatMap((item) => item.lines));

  const rows: MenuItemRow[] = items.map((item) => {
    const { cost, complete, partsPrice } = menuItemCost(
      item.lines.map((line) => ({ ...line, quantity: Number(line.quantity) })),
      byId,
      materials,
    );
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      lto: item.lto,
      meal: item.meal,
      size: item.size,
      active: item.active,
      price: item.price === null ? null : Number(item.price),
      contents: item.lines
        .map((line) => {
          const name = lineName(line, byId);
          const quantity = Number(line.quantity);
          return quantity === 1 ? name : `${quantity} × ${name}`;
        })
        .join(", "),
      cost,
      complete,
      parts_price: partsPrice,
      updated: item.updated_at.toISOString().slice(0, 10),
    };
  });
  return { recipes, rows };
}

/**
 * The brand menu as import-template rows (one per line, item columns on the
 * first line only), and the recipes the "Recipe or material" column accepts.
 * An empty menu gets one example combo so the format is obvious.
 */
export async function getMenuSheetRows(brand: RecipeBrand) {
  const [recipes, items] = await Promise.all([
    listRecipeOptions(brand),
    prisma.menu_item.findMany({
      where: { brandId: brand.id },
      include: withLines,
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
  ]);
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const blank = ["", "", "", "", "", "", "", ""];

  const menu: (string | number)[][] = items.flatMap((item) =>
    item.lines.map((line, index) => {
      const price = item.price === null ? null : Number(item.price);
      return [
        ...(index === 0
          ? [
              item.name,
              item.category,
              item.lto ? "LTO" : "Menu Item",
              item.meal ? "Yes" : "No",
              item.size ?? "",
              item.active ? "Active" : "Disabled",
              price ?? "",
              netSellingPrice(price) ?? "",
            ]
          : blank),
        // A deleted recipe keeps its old name: the import then reports it.
        line.item_number ??
          ((line.recipeId !== null && byId.get(line.recipeId)?.name) ||
            line.name),
        Number(line.quantity),
      ];
    }),
  );
  if (menu.length === 0 && recipes.length >= 2) {
    menu.push(
      [
        "Example meal",
        "Combos",
        "Menu Item",
        "Yes",
        "normal",
        "Disabled",
        9.9,
        netSellingPrice(9.9)!,
        recipes[0].name,
        1,
      ],
      [...blank, recipes[1].name, 1],
    );
  }
  return { menu, recipes };
}

/** A menu item of the brand with its lines and their live SAP materials. */
export async function getMenuItem(brandId: number, id: number) {
  const item = await prisma.menu_item.findFirst({
    where: { id, brandId },
    include: withLines,
  });
  if (!item) return null;
  return { ...item, materials: await materialsOf(item.lines) };
}

/** True when the name is taken by another menu item of the brand. */
function isNameTaken(cause: unknown) {
  return (
    cause instanceof Prisma.PrismaClientKnownRequestError &&
    cause.code === "P2002"
  );
}

/**
 * Creates (`id` null) or updates a menu item, replacing its lines. Recipes
 * must belong to the brand; materials are re-checked against SAP (and the
 * brand's SAP company). Returns the id, or an error message.
 */
export async function saveMenuItem(input: {
  brand: RecipeBrand;
  id: number | null;
  userId: string;
  data: MenuItemForm;
}): Promise<
  { id: number } | { error: string; field: "name" | "lines._errors" }
> {
  const brandId = input.brand.id;
  const recipeIds = [
    ...new Set(input.data.lines.flatMap((line) => line.recipeId ?? [])),
  ];
  const materialLines = input.data.lines.flatMap((line) =>
    line.item_number
      ? [{ database_id: line.database_id ?? "", item_number: line.item_number }]
      : [],
  );
  if (materialLines.some((line) => !line.database_id)) {
    return { error: "Pick materials from the search", field: "lines._errors" };
  }
  const [recipes, others, sap] = await Promise.all([
    prisma.recipe.findMany({
      where: { brandId, id: { in: recipeIds } },
      select: { id: true, import_name: true, item_description: true },
    }),
    prisma.menu_item.findMany({
      where: {
        brandId,
        ...(input.id === null ? {} : { id: { not: input.id } }),
      },
      select: { name: true },
    }),
    validateRecipeLines(input.brand, materialLines),
  ]);
  // The unique index is case-sensitive; the import matches names like this.
  const name = normalize(input.data.name);
  if (others.some((other) => normalize(other.name) === name)) {
    return { error: "Another menu item has this name", field: "name" };
  }
  if (recipes.length !== recipeIds.length) {
    return {
      error: "A recipe was deleted meanwhile: reload the page",
      field: "lines._errors",
    };
  }
  const sapErrors = Object.values(sap.errors);
  if (sapErrors.length > 0) {
    return { error: sapErrors.join(". "), field: "lines._errors" };
  }
  const recipeNames = new Map(
    recipes.map((recipe) => [
      recipe.id,
      recipe.import_name ?? recipe.item_description,
    ]),
  );

  const { lines, price, meal, size, ...fields } = input.data;
  const data = {
    ...fields,
    meal,
    size: meal ? size : null,
    price,
    updated_by: input.userId,
  };
  const rows = lines.map((line, sort_order) => {
    const material = line.item_number
      ? sap.sapItems.get(
          sapKey({
            database_id: line.database_id ?? "",
            item_number: line.item_number,
          }),
        )
      : undefined;
    return {
      sort_order,
      recipeId: line.recipeId,
      database_id: material ? material.database_id : null,
      item_number: material ? material.item_number : null,
      name: material
        ? material.item_description
        : (recipeNames.get(line.recipeId ?? 0) ?? ""),
      uom: material?.purchasing_uom ?? "",
      quantity: line.quantity,
    };
  });

  try {
    const id = await prisma.$transaction(async (tx) => {
      const item =
        input.id === null
          ? await tx.menu_item.create({ data: { ...data, brandId } })
          : await tx.menu_item.update({
              // brandId in the filter: never touch another brand's item.
              where: { id: input.id, brandId },
              data,
            });
      await tx.menu_item_line.deleteMany({ where: { menuItemId: item.id } });
      await tx.menu_item_line.createMany({
        data: rows.map((row) => ({ ...row, menuItemId: item.id })),
      });
      return item.id;
    });
    return { id };
  } catch (cause) {
    if (isNameTaken(cause)) {
      return { error: "Another menu item has this name", field: "name" };
    }
    throw cause;
  }
}

export async function setMenuItemsActive(
  brandId: number,
  ids: number[],
  active: boolean,
  userId: string,
) {
  const { count } = await prisma.menu_item.updateMany({
    where: { brandId, id: { in: ids } },
    data: { active, updated_by: userId },
  });
  return count;
}

export async function deleteMenuItems(brandId: number, ids: number[]) {
  const { count } = await prisma.menu_item.deleteMany({
    where: { brandId, id: { in: ids } },
  });
  return count;
}

/**
 * Saves a parsed menu sheet in one transaction: items match stored ones by
 * name (case/spacing ignored) and get their lines replaced; new names are
 * created; menu items not in the file are left alone.
 */
export async function importMenu(
  brandId: number,
  userId: string,
  items: MenuImportItem[],
): Promise<MenuImportResult> {
  const stored = await prisma.menu_item.findMany({
    where: { brandId },
    select: { id: true, name: true },
  });
  const idByName = new Map(
    stored.map((item) => [normalize(item.name), item.id]),
  );
  let created = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const item of items) {
        const existing = idByName.get(normalize(item.name));
        const data = {
          name: item.name,
          category: item.category,
          lto: item.lto,
          meal: item.meal,
          size: item.size,
          price: item.price,
          updated_by: userId,
          ...(item.active === undefined ? {} : { active: item.active }),
        };
        const id =
          existing ??
          (await tx.menu_item.create({ data: { ...data, brandId } })).id;
        if (existing === undefined) created += 1;
        else {
          await tx.menu_item.update({ where: { id }, data });
          await tx.menu_item_line.deleteMany({ where: { menuItemId: id } });
        }
        await tx.menu_item_line.createMany({
          data: item.lines.map((line, sort_order) => ({
            menuItemId: id,
            sort_order,
            ...line,
          })),
        });
      }
    },
    // ~3 queries per item against the LAN database.
    { timeout: 120_000, maxWait: 10_000 },
  );
  return { created, updated: items.length - created };
}
