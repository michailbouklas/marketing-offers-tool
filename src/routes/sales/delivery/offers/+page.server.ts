import { buildOfferMatrix } from "$lib/services/sales-delivery";
import { getDeliveryCampaigns } from "$lib/services/sales-delivery.server";
import { getOfferValuesForRange } from "$lib/services/sales-offers.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ parent }) => {
  const { scope, channel, channels } = await parent();
  if (!scope) return {};

  const { filters } = scope;
  const brand = filters.brands[0];
  const range = { from: filters.from, to: filters.to };
  const picked = channel ? [channel] : channels.map((c) => c.channel);

  // One /sales/offers valuation per channel (orders scoped by channel), plus one
  // over all picked channels for the offer dialog (days on sale and first/last
  // sale do not add up across channels). Streamed.
  const offers = Promise.all([
    Promise.all(picked.map((c) => getOfferValuesForRange(brand, range, [c]))),
    picked.length > 1 ? getOfferValuesForRange(brand, range, picked) : null,
    getDeliveryCampaigns(brand, filters.from, filters.to),
  ]).then(([values, combined, campaigns]) => ({
    idealFcPerc: values[0]?.idealFcPerc ?? null,
    channelNet: picked.map(
      (c) => channels.find((item) => item.channel === c)?.net ?? 0,
    ),
    scopeOffers: (combined ?? values[0])?.offers ?? [],
    matrix: buildOfferMatrix(
      picked.map((c, i) => ({ channel: c, offers: values[i].offers })),
      campaigns,
    ),
  }));

  return { picked, offers };
};
