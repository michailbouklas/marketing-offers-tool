import { error, json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { generateExcelFile } from "$lib/server/mastra/tools/generate-excel";
import { withSingleBrand } from "$lib/services/sales-dashboard";
import { resolveSalesDashboardScope } from "$lib/services/sales-dashboard.server";
import {
  OFFER_VERDICT_LABELS,
  parseOfferDateRange,
  parseOfferLocations,
} from "$lib/services/sales-offers";
import {
  getCachedOfferValues,
  getOfferValuesForRange,
} from "$lib/services/sales-offers.server";
import type { RequestHandler } from "./$types";

const money = (value: number | null) =>
  value === null ? null : Math.round(value * 100) / 100;
const pct = (value: number | null) =>
  value === null ? null : Math.round(value * 10_000) / 100;

/**
 * .xlsx of every offer of the page's brand and date range (re-queried
 * server-side, never client data): same numbers as the table, all rows,
 * ignoring the on-screen verdict filter and search.
 */
export const GET: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, { sales: ["view"] });
  const scope = await resolveSalesDashboardScope(event, user.id);
  if (!scope) error(403, "No brands assigned");

  const { brands, channels } = withSingleBrand(scope.filters);
  const brand = brands[0];
  const range = parseOfferDateRange(event.url.searchParams);
  const locations = parseOfferLocations(event.url.searchParams);
  const values =
    range || channels.length > 0 || locations.length > 0
      ? await getOfferValuesForRange(brand, range, channels, locations)
      : await getCachedOfferValues(brand);
  if (!values) error(404, "This brand's offers have not been computed yet");

  const result = await generateExcelFile({
    filename: `offers-${brand}-${range ? `${range.from}-to-${range.to}` : "all-time"}${channels.length > 0 ? `-${channels.join("-")}` : ""}${locations.length > 0 ? `-${locations.length}-locations` : ""}`,
    sheets: [
      {
        name: "Offers",
        columns: [
          "Code",
          "Offer",
          "Channel",
          "Category",
          "First sale",
          "Last sale",
          "Days on sale",
          "Units",
          "Orders",
          "Offer net (EUR)",
          "Discount given vs list price (EUR)",
          "Food cost (EUR)",
          "Add-on net (EUR)",
          "Add-on / order (EUR)",
          "Contribution (EUR)",
          "Margin (%)",
          "Verdict",
          "Catalogue FC (%)",
          "Catalogue FC (EUR)",
          "Catalogue selling price (EUR)",
        ],
        rows: values.offers.map((offer) => [
          offer.code,
          offer.name,
          offer.channel,
          offer.category,
          offer.firstSale,
          offer.lastSale,
          offer.daysOnSale,
          Math.round(offer.units),
          offer.orders,
          money(offer.offerNet),
          money(offer.discountGiven),
          money(offer.foodCost),
          money(offer.addonNet),
          money(offer.orders > 0 ? offer.addonNet / offer.orders : null),
          money(offer.contribution),
          pct(offer.marginPct),
          OFFER_VERDICT_LABELS[offer.verdict],
          pct(offer.fcPerc),
          money(offer.fcEur),
          money(offer.sellingPrice),
        ]),
      },
    ],
  });

  if (!result.ok) {
    console.error(`[sales-offers] export failed: ${result.error}`);
    error(500, "The Excel export could not be generated");
  }

  return json({ downloadUrl: result.downloadUrl });
};
