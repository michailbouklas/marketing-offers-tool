import type {
  buildChannelVs,
  buildOfferMatrix,
  DeliveryCampaign,
  DeliveryDashboard,
} from "../../../services/sales-delivery";
import type { GatewayOutcome } from "./forecast-gateway";

/**
 * Seam between the sales-delivery assistant tools and the app services in
 * src/lib/services/*.server.ts (which import $lib/$env, forbidden under
 * src/lib/server/mastra/). The app installs the implementation from
 * src/hooks.server.ts (src/lib/server/sales-delivery-gateway.server.ts); without it the
 * tools fail closed. Imports here are type-only or relative.
 *
 * Every method resolves the date range exactly like the /sales/delivery
 * layout (missing `to` = latest loaded day, missing `from` = Jan 1 of the
 * `to` year, at most 366 days) and runs the page's own services + builders,
 * so the numbers equal what the page shows.
 */
export type DeliveryRange = { from: string; to: string };

export type DeliveryRangeInput = {
  /** Lowercase brand alias, already authorised by the tool. */
  brand: string;
  from: string | null;
  to: string | null;
};

export type DeliveryOverviewOutcome = {
  range: DeliveryRange;
  dashboard: DeliveryDashboard;
};

export type DeliveryChannelVsOutcome = {
  range: DeliveryRange;
  vs: ReturnType<typeof buildChannelVs>;
};

export type DeliveryOfferValuesOutcome = {
  range: DeliveryRange;
  /** Brand's ideal food-cost %, null when not set. */
  idealFcPerc: number | null;
  /** The page's offer matrix for this one channel (cells have one entry). */
  matrix: ReturnType<typeof buildOfferMatrix>;
};

export interface SalesDeliveryGateway {
  /** Overview tab: KPIs (range + MTD), channel shares, daily/monthly, locations. */
  getOverview(
    input: DeliveryRangeInput & { channel: string | null },
  ): Promise<GatewayOutcome<DeliveryOverviewOutcome>>;
  /** Channel VS tab; fewer than two requested channels with sales = top two. */
  compareChannels(
    input: DeliveryRangeInput & { channels: string[] },
  ): Promise<GatewayOutcome<DeliveryChannelVsOutcome>>;
  /** Registered aggregator offers (Postgres) overlapping the range. */
  getCampaigns(
    input: DeliveryRangeInput,
  ): Promise<
    GatewayOutcome<{ range: DeliveryRange; campaigns: DeliveryCampaign[] }>
  >;
  /** Offers tab valuation for ONE channel (heavy ClickHouse query). */
  getOfferValues(
    input: DeliveryRangeInput & { channel: string },
  ): Promise<GatewayOutcome<DeliveryOfferValuesOutcome>>;
}

const globalForSalesDeliveryGateway = globalThis as typeof globalThis & {
  salesDeliveryGateway?: SalesDeliveryGateway | null;
};

export function setSalesDeliveryGateway(
  gateway: SalesDeliveryGateway | null,
): void {
  globalForSalesDeliveryGateway.salesDeliveryGateway = gateway;
}

export function getSalesDeliveryGateway(): SalesDeliveryGateway | null {
  return globalForSalesDeliveryGateway.salesDeliveryGateway ?? null;
}
