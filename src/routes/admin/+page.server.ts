import { hasPermission, requireAdminUser } from "$lib/server/auth-guards";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requireAdminUser(event);

  const [pendingSubmissions, dimOffers, users, brands, imageUsage] =
    await Promise.all([
      hasPermission(event, { submission: ["approve"] }),
      hasPermission(event, { submission: ["approve"] }),
      hasPermission(event, { user: ["list"] }),
      hasPermission(event, { brand: ["manage"] }),
      hasPermission(event, { imageGenerator: ["view-usage"] }),
    ]);

  return {
    access: { pendingSubmissions, dimOffers, users, brands, imageUsage },
  };
};
