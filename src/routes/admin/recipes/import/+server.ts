import { error } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { sseResponse } from "$lib/server/sse";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  type ImportCell,
} from "$lib/services/recipe-import";
import {
  parseRecipeWorkbook,
  runRecipeImport,
  validateRecipeImport,
} from "$lib/services/recipe-import.server";
import { requireRecipeBrand } from "$lib/services/recipes.server";
import type { RequestHandler } from "./$types";

/**
 * POST multipart `brand` (alias) + `file` (.xlsx). File-level problems answer
 * with a plain HTTP error; otherwise the response is an SSE stream of
 * `RecipeImportEvent`s: validating → invalid | progress… → done | error.
 */
export const POST: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, { recipe: ["manage"] });
  const form = await event.request.formData();
  const { brand } = await requireRecipeBrand(
    event,
    String(form.get("brand") ?? ""),
  );

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    error(400, "Choose an .xlsx file to import");
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    error(400, "Only .xlsx files are supported");
  }
  if (file.size > MAX_IMPORT_BYTES) {
    error(413, `The file is larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB`);
  }

  let sheet: ImportCell[][];
  try {
    sheet = await parseRecipeWorkbook(file);
  } catch {
    error(400, "The file could not be read as an Excel workbook");
  }
  if (sheet.length - 1 > MAX_IMPORT_ROWS) {
    error(400, `The file has more than ${MAX_IMPORT_ROWS} rows`);
  }

  return sseResponse(async (send) => {
    send({ type: "validating" });
    let validation: Awaited<ReturnType<typeof validateRecipeImport>>;
    try {
      validation = await validateRecipeImport(brand, sheet);
    } catch (cause) {
      console.error("[recipes/import] validation failed", cause);
      send({
        type: "error",
        message:
          "Could not check the file against the menu and SAP. Nothing was imported.",
      });
      return;
    }
    if (validation.errors.length > 0) {
      send({ type: "invalid", errors: validation.errors });
      return;
    }

    let imported = 0;
    try {
      await runRecipeImport({
        brandId: brand.id,
        userId: user.id,
        recipes: validation.recipes,
        sapItems: validation.sapItems,
        onProgress: (progress) => {
          imported = progress.done;
          send({ type: "progress", ...progress });
        },
      });
      send({ type: "done", imported });
    } catch (cause) {
      console.error("[recipes/import] import failed", cause);
      const failed = validation.recipes[imported];
      send({
        type: "error",
        message: `Import stopped at ${failed?.itemCode ?? "?"} (${failed?.description ?? ""}). ${imported} recipes were saved before it.`,
        imported,
      });
    }
  });
};
