import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { requireApiPermission } from "$lib/server/auth-guards";
import { prisma } from "$lib/server/prisma";
import { requireRecipeBrand } from "$lib/services/recipes.server";
import type { RequestHandler } from "./$types";

const bodySchema = z.object({
  brand: z.string().max(100),
  ids: z.array(z.number().int()).min(1).max(5_000),
});

/**
 * Deletes the recipes the user confirmed after an import (duplicates and
 * recipes no longer in the workbook). Limited to the brand; lines cascade.
 */
export const POST: RequestHandler = async (event) => {
  await requireApiPermission(event, { recipe: ["manage"] });
  const parsed = bodySchema.safeParse(
    await event.request.json().catch(() => null),
  );
  if (!parsed.success) error(400, "Invalid request");
  const { brand } = await requireRecipeBrand(event, parsed.data.brand);

  const { count } = await prisma.recipe.deleteMany({
    where: { brandId: brand.id, id: { in: parsed.data.ids } },
  });
  return json({ deleted: count });
};
