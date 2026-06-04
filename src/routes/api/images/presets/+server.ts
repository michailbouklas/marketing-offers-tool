import { error, json } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { presetCreateSchema } from "$lib/services/image-generator/composer-library";
import {
  createPreset,
  listPresetsForUser,
} from "$lib/services/image-generator/composer-library.server";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);
  const items = await listPresetsForUser(user.id);
  return json({ items });
};

export const POST: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);

  let raw: unknown;
  try {
    raw = await event.request.json();
  } catch {
    error(400, "Expected JSON body");
  }

  const parsed = presetCreateSchema.safeParse(raw);
  if (!parsed.success) {
    error(400, parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  const item = await createPreset(user.id, parsed.data);
  return json({ item }, { status: 201 });
};
