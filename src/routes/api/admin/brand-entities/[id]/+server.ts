import { error, json } from "@sveltejs/kit";
import { unassignEntity } from "$lib/services/brand-entities.server";
import { requireApiPermission } from "$lib/server/auth-guards";
import type { RequestHandler } from "./$types";

/** DELETE /api/admin/brand-entities/[id] — remove a single assignment. */
export const DELETE: RequestHandler = async (event) => {
  await requireApiPermission(event, { brand: ["manage"] });

  const id = event.params.id;
  if (!id) {
    error(400, "id is required");
  }

  await unassignEntity(id);
  return json({ ok: true });
};
