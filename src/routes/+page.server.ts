import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import {
  getAuthenticatedUserRole,
  requireAuthenticatedUser,
} from "$lib/server/auth-guards";
import { getUserPreference } from "$lib/services/user-preferences.server";
import {
  availableWidgets,
  DASHBOARD_LAYOUT_PREFERENCE,
  hasSalesSettings,
  dismissedWidgets,
  normalizeLayout,
  widgetTypes,
  type WidgetDataMap,
  type WidgetResult,
} from "$lib/dashboard/widgets";
import {
  listSalesBrands,
  loadWidget,
} from "$lib/server/dashboard-widgets.server";

/** Keyed by widget instance id; the page narrows each entry by the widget's type. */
type StreamedWidgets = Record<
  string,
  Promise<WidgetResult<WidgetDataMap[keyof WidgetDataMap]>>
>;

/**
 * Home dashboard: the layout is awaited so the grid renders at once; each
 * widget's data is streamed and shows a skeleton until it settles. Only
 * widgets in the role-normalised layout are loaded.
 */
export const load: PageServerLoad = async (event) => {
  const { user } = requireAuthenticatedUser(event);
  if (!user) redirect(302, "/login");
  event.depends("app:dashboard");

  const role = await getAuthenticatedUserRole(event);
  const saved = await getUserPreference(user.id, DASHBOARD_LAYOUT_PREFERENCE);
  const layout = normalizeLayout(saved, role);
  const ctx = { userId: user.id, role };

  const streamed: StreamedWidgets = {};
  for (const widget of layout) {
    streamed[widget.id] = loadWidget(ctx, widget);
  }

  const canPickSalesBrand = widgetTypes.some(
    (type) =>
      hasSalesSettings(type) &&
      (layout.some((widget) => widget.type === type) ||
        availableWidgets(layout, role).includes(type)),
  );

  return {
    layout,
    dismissed: dismissedWidgets(saved),
    available: availableWidgets(layout, role),
    salesBrands: canPickSalesBrand ? await listSalesBrands(ctx) : [],
    streamed,
  };
};
