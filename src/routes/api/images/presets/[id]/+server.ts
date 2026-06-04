import { error, json } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { presetUpdateSchema } from "$lib/services/image-generator/composer-library";
import {
  deletePreset,
  updatePreset,
} from "$lib/services/image-generator/composer-library.server";
import type { RequestHandler } from "./$types";

export const PATCH: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);

  let raw: unknown;
  try {
    raw = await event.request.json();
  } catch {
    error(400, "Expected JSON body");
  }

  const parsed = presetUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    error(400, parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  const item = await updatePreset(user.id, event.params.id, parsed.data);
  return json({ item });
};

export const DELETE: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);
  await deletePreset(user.id, event.params.id);
  return new Response(null, { status: 204 });
};
