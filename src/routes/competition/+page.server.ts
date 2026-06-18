import { requirePermission } from "$lib/server/auth-guards";
import { getDashboardStats } from "$lib/services/competition/dashboard.server";
import { getPendingNotificationsForUser } from "$lib/services/notifications/pending.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { user } = await requirePermission(event, { competition: ["view"] });

  const [stats, notifications] = await Promise.all([
    getDashboardStats(),
    user
      ? getPendingNotificationsForUser(user.id)
      : Promise.resolve({ count: 0, items: [] }),
  ]);

  return {
    stats,
    notifications,
  };
};
