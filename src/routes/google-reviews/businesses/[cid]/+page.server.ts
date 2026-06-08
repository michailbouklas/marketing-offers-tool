import { requirePermission } from "$lib/server/auth-guards";
import { getBusinessDetail } from "$lib/services/google-reviews/businesses.server";
import { error } from "@sveltejs/kit";
import { z } from "zod";
import type { PageServerLoad } from "./$types";

// `cid` is Google's business identifier — a long numeric-looking STRING.
// Never coerce it to a number (precision loss); bind it as {cid:String}.
const cidSchema = z.string().trim().min(1);

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { googleReviews: ["view"] });

  const cidResult = cidSchema.safeParse(event.params.cid);

  if (!cidResult.success) {
    error(404, "Business not found");
  }

  const detail = await getBusinessDetail(cidResult.data);

  if (!detail) {
    error(404, "Business not found");
  }

  return { detail };
};
