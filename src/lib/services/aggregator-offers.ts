import { Aggregator } from "../../generated/prisma/enums";
import type { aggregator_offersModel } from "../../generated/prisma/models/aggregator_offers";
import type { BrandOption } from "$lib/services/brands";

export { Aggregator };

export type AggregatorOffer = aggregator_offersModel & {
  brand: BrandOption;
};

export type AggregatorOffersFilters = {
  id?: number;
  aggregator?: Aggregator;
  offer_id?: string;
  brand_id?: number;
  name?: string;
  details?: string;
  active?: boolean;
  active_on?: Date;
  starts_after?: Date;
  starts_before?: Date;
  ends_after?: Date;
  ends_before?: Date;
  created_after?: Date;
  created_before?: Date;
  updated_after?: Date;
  updated_before?: Date;
};

export type CreateAggregatorOfferInput = {
  name: string;
  offer_id: string;
  aggregator: Aggregator;
  brand_id: number;
  details: string;
  starts_at: Date;
  ends_at: Date;
  active?: boolean;
};

export type UpdateAggregatorOfferInput = Partial<CreateAggregatorOfferInput>;
