import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { requireApiPermission } from "$lib/server/auth-guards";
import {
  getBrandGuidelines,
  setBrandGuidelines,
} from "$lib/services/brand-context/brand-context.server";
import {
  brandSlugOr404,
  parseBrandId,
} from "$lib/services/brand-context/brand-route.server";
import type { RequestHandler } from "./$types";

const GUIDELINES_MAX_BYTES = 50_000;

const putBodySchema = z.object({
  markdown: z.string().max(GUIDELINES_MAX_BYTES),
});

export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { brand: ["manage"] });
  const brandId = parseBrandId(event.params.brandId);
  const slug = await brandSlugOr404(brandId);

  const markdown = await getBrandGuidelines(slug);
  return json({ markdown: markdown ?? "" });
};

export const PUT: RequestHandler = async (event) => {
  await requireApiPermission(event, { brand: ["manage"] });
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

  await setBrandGuidelines(slug, parsed.data.markdown);
  return json({ ok: true });
};
