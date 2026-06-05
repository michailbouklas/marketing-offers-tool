import type { CopyType } from "$lib/services/copywriter/types";

/** Active offer surfaced in the composer's offer picker. */
export interface OfferOption {
  id: number;
  name: string;
  aggregator: string;
  brandId: number;
  startsAt: string;
  endsAt: string;
}

/** What the composer hands back on submit; the page adds brand + provider. */
export interface CopySubmitPayload {
  copyType: CopyType;
  channel: string;
  brief: string;
  tone: string;
  variantCount: number;
  offerId: number | null;
  /** The effective guidelines text (may be locally edited). */
  brandGuidelines: string;
}
