import {
  getAuthenticatedUserRole,
  hasPermission,
} from "$lib/server/auth-guards";
import { getPendingNotificationCountForUser } from "$lib/services/notifications/pending.server";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
  if (!event.locals.user) {
    return {
      user: null,
      pendingNotificationCount: 0,
    };
  }

  await getAuthenticatedUserRole(event);

  // Sidebar badge: unsent offer notifications for this user. Only competition
  // viewers can see the menu item, so only they pay for the lookup. Wrapped so a
  // scraper-DB outage degrades to "no badge" instead of breaking every page.
  let pendingNotificationCount = 0;

  if (await hasPermission(event, { competition: ["view"] })) {
    try {
      pendingNotificationCount = await getPendingNotificationCountForUser(
        event.locals.user.id,
      );
    } catch (error) {
      console.error(
        "[notifications] failed to load pending count for sidebar:",
        error,
      );
    }
  }

  return {
    user: event.locals.user,
    pendingNotificationCount,
  };
};
