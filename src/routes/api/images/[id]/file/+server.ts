import { error } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { getObjectStore } from "$lib/server/object-store.server";
import { prisma } from "$lib/server/prisma";
import type { RequestHandler } from "./$types";

function generatedImageKey(localPath: string): string {
  const normalized = localPath.replaceAll("\\", "/");
  return normalized.startsWith("uploads/")
    ? normalized.slice("uploads/".length)
    : normalized;
}

export const GET: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);

  const id = event.params.id;
  if (!id) {
    error(400, "id is required");
  }

  const row = await prisma.generatedImage.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true, localPath: true },
  });

  if (!row) {
    error(404, "Not found");
  }

  if (row.userId !== user.id) {
    error(403, "Forbidden");
  }

  if (!row.localPath || row.status !== "completed") {
    error(404, "Not ready");
  }

  const storageKey = generatedImageKey(row.localPath);
  const bytes = await getObjectStore().tryGet(storageKey);
  if (!bytes) {
    error(404, "Not found");
  }

  const ext = storageKey.split(".").pop()?.toLowerCase() ?? "png";
  const contentType =
    ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-length": String(bytes.length),
      "content-disposition": `inline; filename="${id}.${ext}"`,
    },
  });
};
