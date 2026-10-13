import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { requireApiPermission } from "$lib/server/auth-guards";
import { prisma } from "$lib/server/prisma";
import type { RequestHandler } from "./$types";

/**
 * Brand-level pricing targets. `ideal_fc_perc` travels as a percent
 * (30 = 30%) and is stored as a fraction (0.3000), matching `fc_perc`.
 */
const putBodySchema = z.object({
  ideal_fc_perc: z
    .number()
    .gt(0, "Brand Ideal FC % must be greater than 0")
    .lte(100, "Brand Ideal FC % cannot exceed 100")
    .nullable(),
});

export type BrandPricingTargetsResponse = {
  /** Percent (30 = 30%) or null when unset. */
  ideal_fc_perc: number | null;
};

function parseBrandId(param: string | undefined): number {
  if (!param) {
    error(400, "brandId is required");
  }
  const id = Number.parseInt(param, 10);
  if (!Number.isInteger(id) || id <= 0) {
    error(400, "brandId must be a positive integer");
  }
  return id;
}

function toPercent(fraction: { toString(): string } | null): number | null {
  if (fraction === null) {
    return null;
  }

  return Math.round(Number(fraction.toString()) * 100 * 100) / 100;
}

function toFraction(percent: number | null): string | null {
  if (percent === null) {
    return null;
  }

  return (percent / 100).toFixed(4);
}

async function brandOr404(brandId: number) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true, ideal_fc_perc: true },
  });
  if (!brand) {
    error(404, "Brand not found");
  }
  return brand;
}

export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { brand: ["manage"] });
  const brandId = parseBrandId(event.params.brandId);
  const brand = await brandOr404(brandId);

  return json({
    ideal_fc_perc: toPercent(brand.ideal_fc_perc),
  } satisfies BrandPricingTargetsResponse);
};

export const PUT: RequestHandler = async (event) => {
  await requireApiPermission(event, { brand: ["manage"] });
  const brandId = parseBrandId(event.params.brandId);
  await brandOr404(brandId);

  let raw: unknown;
  try {
    raw = await event.request.json();
  } catch {
    error(400, "Expected JSON body");
  }
  const parsed = putBodySchema.safeParse(raw);
  if (!parsed.success) {
    error(400, parsed.error.issues.map((i) => i.message).join("; "));
  }

  const updated = await prisma.brand.update({
    where: { id: brandId },
    data: { ideal_fc_perc: toFraction(parsed.data.ideal_fc_perc) },
    select: { ideal_fc_perc: true },
  });

  return json({
    ideal_fc_perc: toPercent(updated.ideal_fc_perc),
  } satisfies BrandPricingTargetsResponse);
};
