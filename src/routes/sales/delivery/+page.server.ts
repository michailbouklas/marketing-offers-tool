import {
  buildDeliveryDashboard,
  monthStart,
} from "$lib/services/sales-delivery";
import {
  getDeliveryDayRows,
  getDeliveryLocationRows,
} from "$lib/services/sales-delivery.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ parent }) => {
  const { scope, channel } = await parent();
  if (!scope) return {};

  const { filters } = scope;
  const queryFrom =
    filters.from < monthStart(filters.to)
      ? filters.from
      : monthStart(filters.to);

  const [days, locations] = await Promise.all([
    getDeliveryDayRows(filters.brands, queryFrom, filters.to),
    getDeliveryLocationRows(filters.brands, filters.from, filters.to),
  ]);

  return {
    dashboard: buildDeliveryDashboard({
      days,
      locations,
      from: filters.from,
      to: filters.to,
      channel,
    }),
  };
};
