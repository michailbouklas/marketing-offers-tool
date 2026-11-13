import type { GatewayOutcome } from "$lib/server/mastra/tools/forecast-gateway";
import {
  getSalesDeliveryGateway,
  setSalesDeliveryGateway,
  type DeliveryRange,
  type DeliveryRangeInput,
  type SalesDeliveryGateway,
} from "$lib/server/mastra/tools/sales-delivery-gateway";
import { resolveSalesDashboardFilters } from "$lib/services/sales-dashboard";
import {
  buildChannelVs,
  buildDeliveryDashboard,
  buildOfferMatrix,
  monthStart,
} from "$lib/services/sales-delivery";
import {
  getDeliveryCampaigns,
  getDeliveryDayRows,
  getDeliveryLocationRows,
} from "$lib/services/sales-delivery.server";
import { getOfferValuesForRange } from "$lib/services/sales-offers.server";

const DAY_MS = 86_400_000;
const isoDaysAgo = (days: number) =>
  new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);

/**
 * Latest loaded delivery day of the brand in the last 60 days (the warehouse
 * lags ~1 day). shortcut: the page anchors on the latest day of ANY channel
 * (private getLatestSalesDay); export it from sales-dashboard.server.ts if
 * the two ever disagree.
 */
async function latestDeliveryDay(brand: string): Promise<string> {
  const rows = await getDeliveryDayRows([brand], isoDaysAgo(60), isoDaysAgo(0));
  return (
    rows.reduce((max, row) => (row.day > max ? row.day : max), "") ||
    isoDaysAgo(1)
  );
}

/** Same range rules as /sales/delivery/+layout.server.ts. */
async function resolveRange(input: DeliveryRangeInput): Promise<DeliveryRange> {
  const params = new URLSearchParams();
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  const latest = input.to ?? (await latestDeliveryDay(input.brand));
  const filters = resolveSalesDashboardFilters(params, [input.brand], latest);
  // Year view by default (the shared resolver defaults 30 days).
  if (!input.from) filters.from = `${filters.to.slice(0, 4)}-01-01`;
  return { from: filters.from, to: filters.to };
}

/** Day x channel rows from min(from, 1st of `to` month) so MTD is complete. */
async function dayAndLocationRows(brand: string, range: DeliveryRange) {
  const queryFrom =
    range.from < monthStart(range.to) ? range.from : monthStart(range.to);
  const [days, locations] = await Promise.all([
    getDeliveryDayRows([brand], queryFrom, range.to),
    getDeliveryLocationRows([brand], range.from, range.to),
  ]);
  return { days, locations };
}

async function attempt<T>(run: () => Promise<T>): Promise<GatewayOutcome<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    console.error("[sales-delivery-gateway]", error);
    return {
      ok: false,
      error: {
        code: "QUERY_FAILED",
        message: "The delivery sales query failed.",
        retryable: true,
      },
    };
  }
}

/**
 * SvelteKit-side implementation of the sales-delivery assistant gateway
 * (src/lib/server/mastra/tools/sales-delivery-gateway.ts). Mirrors the three
 * /sales/delivery tab loaders; installed once from src/hooks.server.ts.
 */
export function createSalesDeliveryGateway(): SalesDeliveryGateway {
  return {
    getOverview: (input) =>
      attempt(async () => {
        const range = await resolveRange(input);
        const rows = await dayAndLocationRows(input.brand, range);
        return {
          range,
          dashboard: buildDeliveryDashboard({
            ...rows,
            ...range,
            channel: input.channel,
          }),
        };
      }),
    compareChannels: (input) =>
      attempt(async () => {
        const range = await resolveRange(input);
        const rows = await dayAndLocationRows(input.brand, range);
        return {
          range,
          vs: buildChannelVs({ ...rows, ...range, requested: input.channels }),
        };
      }),
    getCampaigns: (input) =>
      attempt(async () => {
        const range = await resolveRange(input);
        return {
          range,
          campaigns: await getDeliveryCampaigns(
            input.brand,
            range.from,
            range.to,
          ),
        };
      }),
    getOfferValues: (input) =>
      attempt(async () => {
        const range = await resolveRange(input);
        const [values, campaigns] = await Promise.all([
          getOfferValuesForRange(input.brand, range, [input.channel]),
          getDeliveryCampaigns(input.brand, range.from, range.to),
        ]);
        return {
          range,
          idealFcPerc: values.idealFcPerc,
          matrix: buildOfferMatrix(
            [{ channel: input.channel, offers: values.offers }],
            campaigns,
          ),
        };
      }),
  };
}

/** Idempotent: keeps an already-installed gateway (dev HMR, tests). */
export function installSalesDeliveryGateway(): void {
  if (!getSalesDeliveryGateway())
    setSalesDeliveryGateway(createSalesDeliveryGateway());
}
