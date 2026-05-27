import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { requireAdminUser } from "$lib/server/auth-guards";
import { getImageGeneratorEnv } from "$lib/server/env";
import {
  getBrandGuidelines,
  setBrandGuidelines,
} from "$lib/services/brand-context/brand-context.server";
import { prisma } from "$lib/server/prisma";
import type { RequestHandler } from "./$types";

const GUIDELINES_MAX_BYTES = 50_000;

const putBodySchema = z.object({
  markdown: z.string().max(GUIDELINES_MAX_BYTES),
});

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

async function brandSlugOr404(brandId: number): Promise<string> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true, slug: true },
  });
  if (!brand) {
    error(404, "Brand not found");
  }
  if (!brand.slug) {
    error(
      400,
      `Brand ${brandId} has no slug; populate brand.slug before editing guidelines`,
    );
  }
  return brand.slug;
}

export const GET: RequestHandler = async (event) => {
  await requireAdminUser(event);
  const brandId = parseBrandId(event.params.brandId);
  const slug = await brandSlugOr404(brandId);

  const env = getImageGeneratorEnv();
  const markdown = await getBrandGuidelines(slug, env.UPLOADS_DIR);
  return json({ markdown: markdown ?? "" });
};

export const PUT: RequestHandler = async (event) => {
  await requireAdminUser(event);
  const brandId = parseBrandId(event.params.brandId);
  const slug = await brandSlugOr404(brandId);

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

  const env = getImageGeneratorEnv();
  await setBrandGuidelines(slug, parsed.data.markdown, env.UPLOADS_DIR);
  return json({ ok: true });
};
