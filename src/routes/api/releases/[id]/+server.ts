import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { getReleaseDetail } from "$lib/services/releases/releases.server";
import type { RequestHandler } from "./$types";

const idSchema = z.coerce.number().int().positive();

/** Full release (title + markdown body) for the header list; bodies are never shipped in bulk. */
export const GET: RequestHandler = async (event) => {
  requireAuthenticatedApiUser(event);

  const id = idSchema.safeParse(event.params.id);
  if (!id.success) {
    error(400, "Invalid release id.");
  }

  const release = await getReleaseDetail(id.data);
  if (!release) {
    error(404, "Release not found.");
  }

  return json(release);
};
