import {
  getAuthenticatedUserRole,
  hasPermission,
} from "$lib/server/auth-guards";
import { getPendingNotificationCountForUser } from "$lib/services/notifications/pending.server";
import {
  EMPTY_RELEASE_INBOX,
  RELEASES_DEPENDENCY,
  type ReleaseInbox,
} from "$lib/services/releases/releases";
import { getReleaseInboxForUser } from "$lib/services/releases/releases.server";
import { resolveAggregator } from "$lib/services/aggregator-kpis/period-shared.server";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
  // Persisted Foody/Wolt choice for the KPI pages; safe to expose regardless of
  // auth so the client singleton can hydrate on first paint.
  const aggregator = resolveAggregator(event);

  // Lets the client refresh only the release inbox (`invalidate(RELEASES_DEPENDENCY)`)
  // after a dismiss or a live publish, instead of a full `invalidateAll()`.
  event.depends(RELEASES_DEPENDENCY);

  if (!event.locals.user) {
    return {
      user: null,
      pendingNotificationCount: 0,
      aggregator,
      releaseInbox: EMPTY_RELEASE_INBOX,
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

  // Release notes: every release (summaries only) with this user's read state,
  // plus the newest unread body for the announcement dialog. A DB error
  // (e.g. migration not yet applied) degrades to "no releases".
  let releaseInbox: ReleaseInbox = EMPTY_RELEASE_INBOX;
  try {
    releaseInbox = await getReleaseInboxForUser(event.locals.user.id);
  } catch (error) {
    console.error("[releases] failed to load inbox for layout:", error);
  }

  return {
    user: event.locals.user,
    pendingNotificationCount,
    aggregator,
    releaseInbox,
  };
};
