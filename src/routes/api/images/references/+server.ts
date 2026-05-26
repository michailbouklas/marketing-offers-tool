import { error, json } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { getImageGeneratorEnv } from "$lib/server/env";
import { prisma } from "$lib/server/prisma";
import {
  extensionForContentType,
  writeReferenceFile,
} from "$lib/server/reference-storage";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);

  let form: FormData;
  try {
    form = await event.request.formData();
  } catch {
    error(400, "Expected multipart/form-data body");
  }

  const files: File[] = [];
  for (const [, value] of form.entries()) {
    if (value instanceof File) {
      files.push(value);
    }
  }

  if (files.length === 0) {
    error(400, "No files provided");
  }

  for (const file of files) {
    if (!extensionForContentType(file.type)) {
      error(
        400,
        `Unsupported reference content type: ${file.type || "<empty>"}`,
      );
    }
  }

  const env = getImageGeneratorEnv();
  const results: Array<{ id: string; contentType: string }> = [];

  for (const file of files) {
    const id = randomUUID();
    const written = await writeReferenceFile(env.UPLOADS_DIR, id, file);
    const row = await prisma.referenceImage.create({
      data: {
        id,
        userId: user.id,
        localPath: written.localPath,
        contentType: written.contentType,
      },
    });
    results.push({ id: row.id, contentType: row.contentType });
  }

  return json(results);
};
