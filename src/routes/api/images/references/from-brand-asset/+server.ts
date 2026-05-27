import { error, json } from "@sveltejs/kit";
import { copyFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { z } from "zod";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { getImageGeneratorEnv } from "$lib/server/env";
import { prisma } from "$lib/server/prisma";
import {
  extensionForContentType,
  referenceFilePath,
} from "$lib/server/reference-storage";
import type { RequestHandler } from "./$types";

const bodySchema = z.object({
  assetId: z.string().min(1),
});

export const POST: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);

  let raw: unknown;
  try {
    raw = await event.request.json();
  } catch {
    error(400, "Expected JSON body");
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    error(400, parsed.error.issues.map((i) => i.message).join("; "));
  }

  const asset = await prisma.brandAsset.findUnique({
    where: { id: parsed.data.assetId },
    select: { id: true, brandId: true, localPath: true, contentType: true },
  });
  if (!asset) {
    error(404, "Brand asset not found");
  }

  const assignment = await prisma.user_brand.findUnique({
    where: { userId_brandId: { userId: user.id, brandId: asset.brandId } },
    select: { brandId: true },
  });
  if (!assignment) {
    error(403, "Brand is not assigned to this user");
  }

  const extension = extensionForContentType(asset.contentType);
  if (!extension) {
    error(
      400,
      `Unsupported brand asset content type: ${asset.contentType || "<empty>"}`,
    );
  }

  const env = getImageGeneratorEnv();
  const newId = randomUUID();
  const destination = referenceFilePath(env.UPLOADS_DIR, newId, extension);
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  await copyFile(asset.localPath, destination);

  const row = await prisma.referenceImage.create({
    data: {
      id: newId,
      userId: user.id,
      localPath: destination,
      contentType: asset.contentType,
    },
  });

  return json({ id: row.id, contentType: row.contentType });
};
