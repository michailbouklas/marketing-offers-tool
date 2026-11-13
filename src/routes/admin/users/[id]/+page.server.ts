import { error } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms/server";
import { zod4 } from "sveltekit-superforms/adapters";
import { hasSuperUserRole, requirePermission } from "$lib/server/auth-guards";
import { getPageViewEnv } from "$lib/server/env";
import { userAdminActions } from "$lib/server/user-admin-actions";
import { listBrands } from "$lib/services/brands.server";
import { addDays, todayInZone } from "$lib/services/page-views/page-view-days";
import {
  getUserActivityHeatmap,
  getUserHistory,
} from "$lib/services/page-views/page-view-history.server";
import { getUserReleaseReads } from "$lib/services/releases/releases.server";
import { summarizeUserUsage } from "$lib/services/page-views/page-views";
import {
  editUserFormSchema,
  getDefaultEditUserFormData,
} from "$lib/services/user-editor-form";
import {
  getUserById,
  getUserWorkCounts,
  listUserSessions,
} from "$lib/services/users.server";
import type { Actions, PageServerLoad } from "./$types";

/** Usage window shown on the details page; the full history page has filters. */
const USAGE_DAYS = 90;

export const load: PageServerLoad = async (event) => {
  // Same gate as the users list.
  await requirePermission(event, { user: ["list"] });

  const [user, brands, isSuperUser] = await Promise.all([
    getUserById(event.params.id),
    listBrands({ active: true }),
    hasSuperUserRole(event),
  ]);

  if (!user) {
    error(404, "User not found");
  }

  const editForm = await superValidate(
    getDefaultEditUserFormData(user),
    zod4(editUserFormSchema),
    { errors: false, id: "edit-user" },
  );

  // Usage, work, and sessions (IPs, devices) are superUser-only, the same
  // rule as /admin/live-monitoring history.
  if (!isSuperUser) {
    // Not `user`: that key is the signed-in user from the root layout (sidebar).
    return { profile: user, brands, editForm, isSuperUser, usage: null };
  }

  const timeZone = getPageViewEnv().ACTIVITY_TIMEZONE;
  const today = todayInZone(timeZone);
  const range = { from: addDays(today, 1 - USAGE_DAYS), to: today };
  // shortcut: window start is UTC midnight, not activity-timezone midnight (off by up to a few hours); fine for 90-day counts.
  const since = new Date(`${range.from}T00:00:00Z`);

  const [history, work, sessions, heatmap, releases] = await Promise.all([
    getUserHistory(user.id, range),
    getUserWorkCounts(user.id, since),
    listUserSessions(user.id),
    getUserActivityHeatmap(user.id, range),
    getUserReleaseReads(user.id),
  ]);

  return {
    profile: user,
    brands,
    editForm,
    isSuperUser,
    usage: history
      ? {
          ...summarizeUserUsage(history, range),
          range,
          timeZone,
          work,
          sessions,
          heatmap,
          releases,
        }
      : null,
  };
};

export const actions: Actions = { ...userAdminActions };
