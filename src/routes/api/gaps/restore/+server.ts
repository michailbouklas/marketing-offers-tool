import { json } from "@sveltejs/kit";
import { z } from "zod";
import { requireApiPermission } from "$lib/server/auth-guards";
import { listBrandsForUser } from "$lib/services/brands.server";
import { restoreGaps } from "$lib/services/offers-data-quality.server";
import type { RequestHandler } from "./$types";

const restoreGapsSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(500),
});

export const POST: RequestHandler = async (event) => {
  // Same gate as removal: only approvers manage the removed list.
  const { user } = await requireApiPermission(event, {
    submission: ["reject"],
  });

  let requestBody: unknown;

  try {
    requestBody = await event.request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const payloadResult = restoreGapsSchema.safeParse(requestBody);

  if (!payloadResult.success) {
    return json({ error: "Select at least one valid gap." }, { status: 400 });
  }

  const brands = await listBrandsForUser(user.id);
  const result = await restoreGaps(
    payloadResult.data.ids,
    brands.map((brand) => brand.alias),
  );

  return json(result, { status: result.failed.length > 0 ? 207 : 200 });
};
