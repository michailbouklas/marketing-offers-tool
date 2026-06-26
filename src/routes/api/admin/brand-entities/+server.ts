import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import {
  brandEntityTypes,
  isValidEntityId,
  type BrandEntityType,
} from "$lib/services/brand-entities";
import {
  assignEntityToBrand,
  listBrandAssignments,
} from "$lib/services/brand-entities.server";
import { requireApiPermission } from "$lib/server/auth-guards";
import { prisma } from "$lib/server/prisma";
import type { RequestHandler } from "./$types";

const postBodySchema = z.object({
  brandId: z.number().int().positive(),
  entityType: z.enum(brandEntityTypes),
  entityId: z.string().trim().min(1),
});

/** GET /api/admin/brand-entities?brandId=&entityType= — list assignments. */
export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { brand: ["manage"] });

  const brandIdParam = event.url.searchParams.get("brandId");
  let brandId: number | undefined;
  if (brandIdParam !== null) {
    const parsed = Number.parseInt(brandIdParam, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      error(400, "brandId must be a positive integer");
    }
    brandId = parsed;
  }

  const entityTypeParam = event.url.searchParams.get("entityType");
  let entityType: BrandEntityType | undefined;
  if (entityTypeParam !== null) {
    if (!(brandEntityTypes as readonly string[]).includes(entityTypeParam)) {
      error(400, "Unknown entityType");
    }
    entityType = entityTypeParam as BrandEntityType;
  }

  const items = await listBrandAssignments({ brandId, entityType });
  return json({ items });
};

/** POST /api/admin/brand-entities — assign (or move) an entity to a brand. */
export const POST: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, { brand: ["manage"] });

  let raw: unknown;
  try {
    raw = await event.request.json();
  } catch {
    error(400, "Expected JSON body");
  }

  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    error(400, parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  const { brandId, entityType, entityId } = parsed.data;

  if (!isValidEntityId(entityType, entityId)) {
    error(400, `Invalid entityId for entityType "${entityType}"`);
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true },
  });
  if (!brand) {
    error(404, "Brand not found");
  }

  const assignment = await assignEntityToBrand({
    brandId,
    entityType,
    entityId,
    createdBy: user.id,
  });

  return json({ assignment }, { status: 201 });
};
