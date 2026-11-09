import { redirect } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import { resolveSalesDashboardScope } from "$lib/services/sales-dashboard.server";
import { withSingleBrand } from "$lib/services/sales-dashboard";
import { resolveDeliveryChannel } from "$lib/services/sales-delivery";
import { getDeliveryChannelTotals } from "$lib/services/sales-delivery.server";
import type { LayoutServerLoad } from "./$types";

/** Brand, date range and channel shared by every /sales/delivery tab. */
export const load: LayoutServerLoad = async (event) => {
  const { user } = await requirePermission(event, { sales: ["view"] });
  if (!user) redirect(302, "/login");
  const scope = await resolveSalesDashboardScope(event, user.id);

  if (!scope) {
    return { scope: null, channel: null, channels: [] };
  }

  const filters = withSingleBrand(scope.filters);
  // Year view by default (the shared resolver defaults to 30 days).
  if (!event.url.searchParams.get("from")) {
    filters.from = `${filters.to.slice(0, 4)}-01-01`;
  }

  return {
    scope: { brands: scope.brands, filters },
    channel: resolveDeliveryChannel(event.url.searchParams.get("channel")),
    channels: await getDeliveryChannelTotals(
      filters.brands,
      filters.from,
      filters.to,
    ),
  };
};
