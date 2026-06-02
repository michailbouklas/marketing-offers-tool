import type { PageServerLoad } from "./$types";
import { getHomeOfferWidgets } from "$lib/services/home-offer-widgets";
import { countUsers } from "$lib/services/users.server";
import { getPendingGapSubmissionCount } from "$lib/services/offers-data-quality.server";
import { getAdminImageUsageOverview } from "$lib/services/image-generator/image-generator.server";
import {
  getAuthenticatedUserRole,
  hasPermission,
  requireAuthenticatedUser,
} from "$lib/server/auth-guards";

export const load: PageServerLoad = async (event) => {
  requireAuthenticatedUser(event);

  // Each role surfaces its own dashboard widgets; a multi-role user sees the
  // union. Resolve the capability flags first (mirrors /admin/+page.server.ts),
  // then only load the data for the sections this user can actually see.
  const [userRole, canEditOffers, canApprove, canManageUsers, canViewUsage] =
    await Promise.all([
      getAuthenticatedUserRole(event),
      hasPermission(event, { offer: ["edit"] }),
      hasPermission(event, { submission: ["approve"] }),
      hasPermission(event, { user: ["list"] }),
      hasPermission(event, { imageGenerator: ["view-usage"] }),
    ]);

  const [offers, pendingCount, userCount, usageOverview] = await Promise.all([
    canEditOffers ? getHomeOfferWidgets() : Promise.resolve(null),
    canApprove ? getPendingGapSubmissionCount() : Promise.resolve(null),
    canManageUsers ? countUsers() : Promise.resolve(null),
    canViewUsage ? getAdminImageUsageOverview() : Promise.resolve(null),
  ]);

  return {
    userRole,
    access: { canEditOffers, canApprove, canManageUsers, canViewUsage },
    offers,
    approvals: pendingCount === null ? null : { pendingCount },
    users: userCount === null ? null : { userCount },
    usage: usageOverview === null ? null : { summary: usageOverview.summary },
  };
};
