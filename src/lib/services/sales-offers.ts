import { IDEAL_PRICE_MARKUP_FACTORS } from "./offers-data-quality";
import { formatSalesAmount } from "./sales-dashboard";

/**
 * /sales/offers: all-time value of each offer of one brand. Offer net is every
 * line hanging off the offer (`trde_combo_item = code`), so offers priced on the
 * header and offers priced on their components both count. Add-on net is the
 * rest of the basket in orders that contain the offer, split evenly when an
 * order holds several offers.
 */
export type OfferValueRow = {
  code: string;
  name: string;
  channel: string | null;
  category: string | null;
  fcPerc: number | null;
  fcEur: number | null;
  sellingPrice: number | null;
  firstSale: string;
  lastSale: string;
  daysOnSale: number;
  units: number;
  orders: number;
  offerNet: number;
  addonNet: number;
};

export type OfferVerdict =
  | "positive"
  | "below_target"
  | "loss"
  | "no_cost"
  | "no_target";

export type OfferValue = OfferValueRow & {
  /** Food cost of the offer units sold, € ex VAT; null without dim_offers cost. */
  foodCost: number | null;
  /** Offer net − food cost + add-on net × brand margin; null when unknown. */
  contribution: number | null;
  /** contribution / (offer net + add-on net). */
  marginPct: number | null;
  verdict: OfferVerdict;
};

/** POS net = gross / (1.05 × 1.07), same factors as the DQ ideal price. */
export const VAT_DIVISOR = IDEAL_PRICE_MARKUP_FACTORS.reduce(
  (a, b) => a * b,
  1,
);

/** Food cost per unit, € ex VAT: fc_eur, else fc_perc of the net selling price. */
export function unitFoodCost(
  row: Pick<OfferValueRow, "fcEur" | "fcPerc" | "sellingPrice">,
): number | null {
  // dim_offers stores unknowns as 0 as well as NULL.
  if (row.fcEur) return row.fcEur;
  if (!row.fcPerc || !row.sellingPrice) return null;
  return (row.fcPerc * row.sellingPrice) / VAT_DIVISOR;
}

/**
 * Margin incl. basket vs the brand target (1 − ideal FC %). Add-on food cost is
 * unknown per item, so it is costed at the brand's ideal FC %.
 */
export function valueOffer(
  row: OfferValueRow,
  idealFcPerc: number | null,
): OfferValue {
  const unitCost = unitFoodCost(row);
  const foodCost = unitCost === null ? null : unitCost * row.units;

  if (foodCost === null) {
    return {
      ...row,
      foodCost,
      contribution: null,
      marginPct: null,
      verdict: "no_cost",
    };
  }
  if (idealFcPerc === null) {
    return {
      ...row,
      foodCost,
      contribution: null,
      marginPct: null,
      verdict: "no_target",
    };
  }

  const contribution =
    row.offerNet - foodCost + row.addonNet * (1 - idealFcPerc);
  const revenue = row.offerNet + row.addonNet;
  const marginPct = revenue > 0 ? contribution / revenue : null;
  const verdict =
    contribution <= 0
      ? "loss"
      : marginPct !== null && marginPct >= 1 - idealFcPerc
        ? "positive"
        : "below_target";

  return { ...row, foodCost, contribution, marginPct, verdict };
}

export const OFFER_VERDICT_LABELS: Record<OfferVerdict, string> = {
  positive: "Positive",
  below_target: "Below target",
  loss: "Loss",
  no_cost: "No cost data",
  no_target: "No brand target",
};

/** One offer's POS totals on one business day, for the Offer VS dialog. */
export type OfferDailyRow = {
  code: string;
  day: string;
  units: number;
  orders: number;
  net: number;
};

export type CompareMetric = {
  label: string;
  a: number | null;
  b: number | null;
  kind: "money" | "count" | "decimal" | "percent";
  /** Which direction wins; null = context only, no winner. */
  better: "higher" | "lower" | null;
};

/**
 * Offer VS rows. Rates are per active day / order / unit because the two
 * offers rarely ran for the same length of time.
 */
export function offerCompareMetrics(
  a: OfferValue,
  b: OfferValue,
): CompareMetric[] {
  const per = (value: number | null, by: number) =>
    value === null || by <= 0 ? null : value / by;
  const row = (
    label: string,
    kind: CompareMetric["kind"],
    better: CompareMetric["better"],
    of: (offer: OfferValue) => number | null,
  ): CompareMetric => ({ label, kind, better, a: of(a), b: of(b) });

  return [
    row("Units / active day", "decimal", "higher", (o) =>
      per(o.units, o.daysOnSale),
    ),
    row("Orders / active day", "decimal", "higher", (o) =>
      per(o.orders, o.daysOnSale),
    ),
    row("Offer net / active day", "money", "higher", (o) =>
      per(o.offerNet, o.daysOnSale),
    ),
    row("Contribution / active day", "money", "higher", (o) =>
      per(o.contribution, o.daysOnSale),
    ),
    row("Avg price paid / unit", "money", null, (o) =>
      per(o.offerNet, o.units),
    ),
    row("Food cost / unit", "money", "lower", (o) => per(o.foodCost, o.units)),
    row("Offer margin", "percent", "higher", (o) =>
      o.foodCost === null || o.offerNet <= 0
        ? null
        : 1 - o.foodCost / o.offerNet,
    ),
    row("Add-on / order", "money", "higher", (o) => per(o.addonNet, o.orders)),
    row("Margin incl. basket", "percent", "higher", (o) => o.marginPct),
    row("Active days", "count", null, (o) => o.daysOnSale),
    row("Lifetime units", "count", null, (o) => o.units),
    row("Lifetime offer net", "money", null, (o) => o.offerNet),
    row("Lifetime contribution", "money", null, (o) => o.contribution),
  ];
}

/** "a", "b", or null on a tie, a missing value or a context-only row. */
export function compareWinner(metric: CompareMetric): "a" | "b" | null {
  const { a, b, better } = metric;
  if (better === null || a === null || b === null || a === b) return null;
  return a > b === (better === "higher") ? "a" : "b";
}

const DAY_MS = 86_400_000;

/**
 * Units per week since the offer's first sale in `rows` (index 0 = launch
 * week). Weeks without sales inside the run are 0, so pauses stay visible.
 */
export function weeklyCurve(rows: OfferDailyRow[], code: string): number[] {
  const own = rows.filter((row) => row.code === code);
  if (own.length === 0) return [];
  const first = Math.min(...own.map((row) => Date.parse(row.day)));
  const weeks: number[] = [];
  for (const row of own) {
    const week = Math.floor((Date.parse(row.day) - first) / DAY_MS / 7);
    while (weeks.length <= week) weeks.push(0);
    weeks[week] += row.units;
  }
  return weeks;
}

/** Share of the offer's units sold on each weekday, Monday first. */
export function weekdayMix(rows: OfferDailyRow[], code: string): number[] {
  const units = [0, 0, 0, 0, 0, 0, 0];
  for (const row of rows) {
    if (row.code !== code) continue;
    // getUTCDay: 0 = Sunday; ISO dates parse as UTC midnight.
    units[(new Date(row.day).getUTCDay() + 6) % 7] += row.units;
  }
  const total = units.reduce((sum, value) => sum + value, 0);
  return units.map((value) => (total > 0 ? value / total : 0));
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

/** Plain-language reason for the verdict, for the offer detail dialog. */
export function offerReason(
  offer: OfferValue,
  idealFcPerc: number | null,
): string {
  if (offer.verdict === "no_cost") {
    return "The offers catalogue has no food cost for this offer, so its margin cannot be worked out. Add the FC % and selling price in Offers data quality.";
  }
  if (offer.verdict === "no_target" || idealFcPerc === null) {
    return "The brand has no ideal FC % target, so the extra items in the basket cannot be costed and there is no margin to compare against. An admin can set it on the brand's admin page.";
  }

  const target = 1 - idealFcPerc;
  const foodCost = offer.foodCost ?? 0;
  const contribution = offer.contribution ?? 0;
  const ownMargin = offer.offerNet > 0 ? 1 - foodCost / offer.offerNet : null;
  const ownText =
    ownMargin === null
      ? "The offer itself brought in no net sales"
      : `On its own the offer keeps ${pct(ownMargin)} of its sales after food cost`;

  if (offer.verdict === "loss") {
    return `Food cost (${formatSalesAmount(foodCost)}) is more than the offer's sales plus the margin on the extra items bought with it, so it lost ${formatSalesAmount(-contribution)} overall. ${ownText}.`;
  }

  const total = offer.marginPct ?? 0;
  const lift =
    ownMargin === null
      ? ""
      : ` The extra items customers added move it to ${pct(total)}.`;

  return offer.verdict === "positive"
    ? `${ownText}.${lift} That meets the brand target of ${pct(target)}, so the offer earned ${formatSalesAmount(contribution)} while keeping the margin the brand aims for.`
    : `It made ${formatSalesAmount(contribution)}, but at a thinner margin than the brand target. ${ownText}.${lift} The target is ${pct(target)}, so each euro sold through this offer keeps less than the brand aims for.`;
}
