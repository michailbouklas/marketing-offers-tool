import { error, json } from "@sveltejs/kit";
import { requireApiAdminPermission } from "$lib/server/auth-guards";
import {
  deleteBrandAsset,
  getBrandAsset,
} from "$lib/services/brand-context/brand-context.server";
import type { RequestHandler } from "./$types";

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

export const DELETE: RequestHandler = async (event) => {
  await requireApiAdminPermission(event, { brand: ["manage"] });
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
