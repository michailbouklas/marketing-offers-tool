import { readSheet } from "read-excel-file/node";
import {
  parseStockSummary,
  planImport,
  STOCK_SUMMARY_SHEET,
  stockSummaryItemNumbers,
  type ImportCell,
  type ImportProgress,
  type ImportRecipe,
} from "$lib/services/recipe-import";
import { prisma } from "$lib/server/prisma";
import type { SapItem } from "$lib/services/recipes";
import {
  listMenuItems,
  saveRecipe,
  type RecipeBrand,
} from "$lib/services/recipes.server";
import {
  getSapItemsByNumber,
  resolveSapCompany,
  sapItemKey,
} from "$lib/services/sap-items.server";

/**
 * The workbook's stock-summary sheet as rows of raw cells; throws when the
 * file is not a valid .xlsx or has no sheet of that name.
 */
export async function parseRecipeWorkbook(file: File): Promise<ImportCell[][]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  // The library types date cells as `typeof Date`; at runtime they are Date instances.
  return (await readSheet(buffer, STOCK_SUMMARY_SHEET)) as ImportCell[][];
}

/**
 * Checks every row against the brand menu (ClickHouse) and SAP (MSSQL), and
 * reports what happens to each recipe.
 */
export async function validateRecipeImport(
  brand: RecipeBrand,
  sheet: ImportCell[][],
) {
  const [menu, company] = await Promise.all([
    listMenuItems(brand.alias),
    resolveSapCompany(brand.sap_company_name),
  ]);
  const sapByNumber = await getSapItemsByNumber(
    stockSummaryItemNumbers(sheet),
    company,
  );
  const sapItems = new Map<string, SapItem>(
    [...sapByNumber.values()].flat().map((item) => [sapItemKey(item), item]),
  );
  return { ...parseStockSummary(sheet, menu, sapByNumber), sapItems };
}

/**
 * Saves the recipes one by one (each in its own transaction, replacing that
 * item's lines) and reports progress before each and once at the end.
 * Stops at the first failure; earlier recipes stay saved.
 */
export async function runRecipeImport(input: {
  brandId: number;
  userId: string;
  recipes: ImportRecipe[];
  sapItems: Map<string, SapItem>;
  onProgress: (progress: ImportProgress) => void;
}) {
  const stored = await prisma.recipe.findMany({
    where: { brandId: input.brandId },
    select: {
      id: true,
      item_code: true,
      import_name: true,
      item_description: true,
    },
  });
  const { targets, cleanup } = planImport(input.recipes, stored);
  const total = input.recipes.length;
  for (const [done, recipe] of input.recipes.entries()) {
    input.onProgress({
      done,
      total,
      current: { itemCode: recipe.itemCode, description: recipe.description },
    });
    await saveRecipe({
      brandId: input.brandId,
      recipeId: targets[done],
      itemCode: recipe.itemCode,
      importName: recipe.importName,
      itemDescription: recipe.description,
      userId: input.userId,
      lines: recipe.lines,
      sapItems: input.sapItems,
    });
  }
  input.onProgress({ done: total, total, current: null });
  return cleanup;
}
