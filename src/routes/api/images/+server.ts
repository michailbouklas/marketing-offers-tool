import { json } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { listGeneratedImagesForUser } from "$lib/services/image-generator/image-generator.server";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);

  const since = event.url.searchParams.get("since") ?? undefined;
  const limitRaw = event.url.searchParams.get("limit");
  const limit = limitRaw === null ? undefined : Number(limitRaw);

  const items = await listGeneratedImagesForUser(user.id, { since, limit });
  return json({ items });
};
