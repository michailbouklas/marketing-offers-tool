import { json } from "@sveltejs/kit";
import { requireAuthenticatedUser } from "$lib/server/auth-guards";
import { listChannels } from "$lib/services/offers-data-quality-postgres.server";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  requireAuthenticatedUser(event);

  return json(await listChannels());
};
