import { error } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { getObjectStore } from "$lib/server/object-store.server";
import { prisma } from "$lib/server/prisma";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);

  const id = event.params.id;
  if (!id) {
    error(400, "id is required");
  }

  const asset = await prisma.brandAsset.findUnique({
    where: { id },
    select: { id: true, brandId: true, localPath: true, contentType: true },
  });

  if (!asset) {
    error(404, "Not found");
  }

  const assignment = await prisma.user_brand.findUnique({
    where: { userId_brandId: { userId: user.id, brandId: asset.brandId } },
    select: { brandId: true },
  });
  if (!assignment) {
    error(403, "Forbidden");
  }

  const bytes = await getObjectStore().tryGet(asset.localPath);
  if (!bytes) {
    error(404, "Not found");
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": asset.contentType || "application/octet-stream",
      "content-length": String(bytes.length),
      "content-disposition": `inline; filename="${asset.id}"`,
      "cache-control": "private, max-age=300",
    },
  });
};
