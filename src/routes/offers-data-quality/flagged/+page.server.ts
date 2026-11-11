import { requirePermission } from "$lib/server/auth-guards";
import { listBrandsForUser } from "$lib/services/brands.server";
import {
  listFlaggedGaps,
  listPriceFlaggedSubmissions,
} from "$lib/services/offers-data-quality.server";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  // Same capability as "Remove from list": approvers only.
  const { user } = await requirePermission(event, { submission: ["reject"] });

  if (!user) {
    redirect(302, "/login");
  }

  const type =
    event.url.searchParams.get("type") === "flagged" ? "flagged" : "dismissed";
  const aliases = (await listBrandsForUser(user.id)).map(
    (brand) => brand.alias,
  );

  return {
    type,
    flaggedGaps: type === "dismissed" ? await listFlaggedGaps(aliases) : [],
    priceFlagged:
      type === "flagged" ? await listPriceFlaggedSubmissions(aliases) : [],
  };
};
