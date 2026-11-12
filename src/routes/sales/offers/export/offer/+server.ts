import { error, json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { generateExcelFile } from "$lib/server/mastra/tools/generate-excel";
import { withSingleBrand } from "$lib/services/sales-dashboard";
import { resolveSalesDashboardScope } from "$lib/services/sales-dashboard.server";
import {
  OFFER_VERDICT_LABELS,
  offerReason,
  offerWeeks,
  parseOfferDateRange,
  parseOfferLocations,
} from "$lib/services/sales-offers";
import {
  getCachedOfferValues,
  getOfferDailyRows,
  getOfferFilterOptions,
  getOfferValuesForRange,
} from "$lib/services/sales-offers.server";
import type { RequestHandler } from "./$types";

const money = (value: number | null) =>
  value === null ? null : Math.round(value * 100) / 100;
const pct = (value: number | null) =>
  value === null ? null : Math.round(value * 10_000) / 100;

/**
 * .xlsx of one offer from the detail dialog (re-queried server-side): the
 * value breakdown, weekly sales (the dialog chart) and daily sales, for the
 * page's brand and date range.
 */
export const GET: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, { sales: ["view"] });
  const scope = await resolveSalesDashboardScope(event, user.id);
  if (!scope) error(403, "No brands assigned");

  const code = event.url.searchParams.get("code")?.trim();
  if (!code) error(400, "Missing offer code");

  const filters = withSingleBrand(scope.filters);
  const { brands, channels } = filters;
  const brand = brands[0];
  const range = parseOfferDateRange(event.url.searchParams);
  // Only orders on these channels (?channels=, parsed by the scope).
  const scoped = channels.length > 0 ? channels : undefined;
  const locations = parseOfferLocations(event.url.searchParams);
  const [values, daily, options] = await Promise.all([
    range || scoped || locations.length > 0
      ? getOfferValuesForRange(brand, range, scoped, locations)
      : getCachedOfferValues(brand),
    getOfferDailyRows(brand, [code], range, scoped, locations),
    locations.length > 0 ? getOfferFilterOptions(filters, range) : null,
  ]);
  const locationNames = locations.map(
    (id) =>
      options?.locations.find((item) => item.id === id)?.name ??
      `Location ${id}`,
  );
  const offer = values?.offers.find((item) => item.code === code);
  if (!values || !offer) error(404, "Offer not found for this brand");

  const ideal = values.idealFcPerc;
  const summary: [string, string | number | null][] = [
    ["Code", offer.code],
    ["Offer", offer.name],
    ["Channel", offer.channel],
    ["Category", offer.category],
    ["Period", range ? `${range.from} to ${range.to}` : "All time"],
    ["Sales channels", scoped ? scoped.join(", ") : "All"],
    ["Locations", locationNames.length > 0 ? locationNames.join(", ") : "All"],
    ["First sale", offer.firstSale],
    ["Last sale", offer.lastSale],
    ["Days on sale", offer.daysOnSale],
    ["Units", Math.round(offer.units)],
    ["Orders", offer.orders],
    ["Offer net sales (EUR, excl. VAT)", money(offer.offerNet)],
    [
      "Discount given vs list price (EUR, excl. VAT)",
      money(offer.discountGiven),
    ],
    ["Food cost (EUR)", money(offer.foodCost)],
    [
      "Offer margin (EUR)",
      money(offer.foodCost === null ? null : offer.offerNet - offer.foodCost),
    ],
    [
      "Offer margin (%)",
      pct(
        offer.foodCost === null || offer.offerNet <= 0
          ? null
          : 1 - offer.foodCost / offer.offerNet,
      ),
    ],
    ["Add-on sales (EUR)", money(offer.addonNet)],
    [
      "Add-on margin (EUR, at brand ideal FC)",
      money(ideal === null ? null : offer.addonNet * (1 - ideal)),
    ],
    ["Contribution (EUR)", money(offer.contribution)],
    ["Margin incl. basket (%)", pct(offer.marginPct)],
    ["Brand target margin (%)", pct(ideal === null ? null : 1 - ideal)],
    ["Verdict", OFFER_VERDICT_LABELS[offer.verdict]],
    ["Why", offerReason(offer, ideal)],
    ["Catalogue FC (%)", pct(offer.fcPerc)],
    ["Catalogue FC (EUR)", money(offer.fcEur)],
    ["Catalogue selling price (EUR, incl. VAT)", money(offer.sellingPrice)],
    [
      "Note",
      "Food cost uses today's catalogue. Replaced full-price sales and aggregator commission are not counted.",
    ],
  ];

  const result = await generateExcelFile({
    filename: `offer-${brand}-${offer.code}-${range ? `${range.from}-to-${range.to}` : "all-time"}`,
    sheets: [
      { name: "Summary", columns: ["Field", "Value"], rows: summary },
      {
        name: "Weekly",
        columns: [
          "Week starting",
          "Units",
          "Orders",
          "Net sales (EUR)",
          "Avg price paid / unit (EUR)",
        ],
        rows: offerWeeks(daily, offer.code).map((week) => [
          week.weekStart,
          Math.round(week.units),
          week.orders,
          money(week.net),
          money(week.price),
        ]),
      },
      {
        // shortcut: 4 columns keep ~9 years of days under generateExcelFile's 20k-cell cap; split by year if an offer outlives that.
        name: "Daily",
        columns: ["Date", "Units", "Orders", "Net sales (EUR)"],
        rows: daily.map((day) => [
          day.day,
          Math.round(day.units),
          day.orders,
          money(day.net),
        ]),
      },
    ],
  });

  if (!result.ok) {
    console.error(`[sales-offers] offer export failed: ${result.error}`);
    error(500, "The Excel export could not be generated");
  }

  return json({ downloadUrl: result.downloadUrl });
};
