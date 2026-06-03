import { json } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { buildImageGeneratorConfig } from "$lib/services/image-providers/config.server";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  requireAuthenticatedApiUser(event);
  return json(await buildImageGeneratorConfig());
};
