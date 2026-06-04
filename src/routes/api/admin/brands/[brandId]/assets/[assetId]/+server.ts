import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { requireApiPermission } from "$lib/server/auth-guards";
import {
  deleteBrandAsset,
  getBrandAsset,
  updateBrandAssetName,
} from "$lib/services/brand-context/brand-context.server";
import type { RequestHandler } from "./$types";

const renameSchema = z.object({
  name: z.string().trim().max(120),
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

export const PATCH: RequestHandler = async (event) => {
  await requireApiPermission(event, { brand: ["manage"] });
  const brandId = parseBrandId(event.params.brandId);
  const assetId = event.params.assetId;
  if (!assetId) {
    error(400, "assetId is required");
  }

  const asset = await getBrandAsset(brandId, assetId);
  if (!asset) {
    error(404, "Brand asset not found");
  }

  const body = await event.request.json().catch(() => null);
  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) {
    error(400, "name must be a string of at most 120 characters");
  }

  await updateBrandAssetName(asset.id, parsed.data.name || null);
  return json({ ok: true });
};

export const DELETE: RequestHandler = async (event) => {
  await requireApiPermission(event, { brand: ["manage"] });
  const brandId = parseBrandId(event.params.brandId);
  const assetId = event.params.assetId;
  if (!assetId) {
    error(400, "assetId is required");
  }

  const asset = await getBrandAsset(brandId, assetId);
  if (!asset) {
    error(404, "Brand asset not found");
  }

  await deleteBrandAsset(asset.id);
  return json({ ok: true });
};
