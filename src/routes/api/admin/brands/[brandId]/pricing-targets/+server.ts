import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { requireApiPermission } from "$lib/server/auth-guards";
import { prisma } from "$lib/server/prisma";
import type { RequestHandler } from "./$types";

/**
 * Brand-level pricing targets. Both travel as a percent (30 = 30%) and are
 * stored as a fraction (0.3000), matching `fc_perc`. `labour_perc` is the
 * labour cost share of ex-VAT net sales; omitting it leaves it unchanged.
 */
const percent = (label: string) =>
  z
    .number()
    .gt(0, `${label} must be greater than 0`)
    .lte(100, `${label} cannot exceed 100`)
    .nullable();

const putBodySchema = z
  .object({
    ideal_fc_perc: percent("Brand Ideal FC %"),
    labour_perc: percent("Brand Labour cost %").optional(),
  })
  .refine(
    (body) => (body.ideal_fc_perc ?? 0) + (body.labour_perc ?? 0) <= 100,
    "Ideal FC % + Labour cost % (prime cost) cannot exceed 100",
  );

export type BrandPricingTargetsResponse = {
  /** Percent (30 = 30%) or null when unset. */
  ideal_fc_perc: number | null;
  /** Percent of ex-VAT net sales, or null when unset. */
  labour_perc: number | null;
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

function toPercent(
  fraction: { toString(): string } | null | undefined,
): number | null {
  if (fraction == null) {
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
    select: { id: true, ideal_fc_perc: true, labour_perc: true },
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
    labour_perc: toPercent(brand.labour_perc),
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

  const { ideal_fc_perc, labour_perc } = parsed.data;
  const updated = await prisma.brand.update({
    where: { id: brandId },
    data: {
      ideal_fc_perc: toFraction(ideal_fc_perc),
      ...(labour_perc === undefined
        ? {}
        : { labour_perc: toFraction(labour_perc) }),
    },
    select: { ideal_fc_perc: true, labour_perc: true },
  });

  return json({
    ideal_fc_perc: toPercent(updated.ideal_fc_perc),
    labour_perc: toPercent(updated.labour_perc),
  } satisfies BrandPricingTargetsResponse);
};
