import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { requireApiAdminPermission } from "$lib/server/auth-guards";
import { listReleaseReaders } from "$lib/services/releases/releases.server";
import type { RequestHandler } from "./$types";

const idSchema = z.coerce.number().int().positive();

/** Users who have read one release, for the admin "Read by" dialog. */
export const GET: RequestHandler = async (event) => {
  await requireApiAdminPermission(event, { release: ["manage"] });

  const id = idSchema.safeParse(event.params.id);
  if (!id.success) {
    error(400, "Invalid release id.");
  }

  return json(await listReleaseReaders(id.data));
};
