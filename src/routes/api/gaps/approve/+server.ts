import { json } from "@sveltejs/kit";
import { z } from "zod";
import { requireApiPermission } from "$lib/server/auth-guards";
import { listBrandsForUser } from "$lib/services/brands.server";
import { approveGaps } from "$lib/services/offers-data-quality.server";
import type { RequestHandler } from "./$types";

const approveGapsSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(500),
});

export const POST: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, {
    submission: ["approve"],
  });

  let requestBody: unknown;

  try {
    requestBody = await event.request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const payloadResult = approveGapsSchema.safeParse(requestBody);

  if (!payloadResult.success) {
    return json({ error: "Select at least one valid gap." }, { status: 400 });
  }

  const brands = await listBrandsForUser(user.id);
  const result = await approveGaps(
    payloadResult.data.ids,
    brands.map((brand) => brand.alias),
    user.id,
  );

  return json(result, { status: result.failed.length > 0 ? 207 : 200 });
};
