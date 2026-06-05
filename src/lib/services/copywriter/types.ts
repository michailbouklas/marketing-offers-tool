// Browser-safe copywriter contracts shared by the API, the generation
// service, and the UI. This module is the single source of truth for copy
// types, channels, field shapes, and per-channel character limits.

export type CopyType =
  | "aggregator_offer"
  | "social_caption"
  | "push_sms"
  | "banner_headline";

export type CopyLanguage = "el" | "en";

export const COPY_LANGUAGES: readonly CopyLanguage[] = ["el", "en"];

export const COPY_LANGUAGE_LABELS: Record<CopyLanguage, string> = {
  el: "Greek",
  en: "English",
};

/**
 * One generated variant: the same message written in Greek and English. The
 * keys of each language record are the field keys from the channel's
 * constraints (e.g. `title`/`description` for aggregator copy). `rating` and
 * `picked` are user feedback persisted back onto the stored JSON.
 */
export interface CopyVariant {
  el: Record<string, string>;
  en: Record<string, string>;
  rating?: number | null;
  picked?: boolean;
}

/** One output field of a copy variant, with its optional character budget. */
export interface CopyFieldConstraint {
  field: string;
  label: string;
  /** Hard character budget per language version, when the channel has one. */
  maxLength?: number;
}

export const COPY_TYPE_LABELS: Record<CopyType, string> = {
  aggregator_offer: "Aggregator offer",
  social_caption: "Social caption",
  push_sms: "Push / SMS",
  banner_headline: "Banner headline",
};

export const CHANNEL_LABELS: Record<string, string> = {
  foody: "Foody",
  bolt: "Bolt",
  wolt: "Wolt",
  efood: "efood",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  push: "Push notification",
  sms: "SMS",
  banner: "Banner",
};

export const CHANNELS_BY_TYPE: Record<CopyType, readonly string[]> = {
  aggregator_offer: ["foody", "bolt", "wolt", "efood"],
  social_caption: ["instagram", "facebook", "tiktok"],
  push_sms: ["push", "sms"],
  banner_headline: ["banner"],
};

const AGGREGATOR_FIELDS: CopyFieldConstraint[] = [
  { field: "title", label: "Offer title", maxLength: 40 },
  { field: "description", label: "Offer description", maxLength: 200 },
];

const SOCIAL_FIELDS = (captionMax: number): CopyFieldConstraint[] => [
  { field: "caption", label: "Caption", maxLength: captionMax },
  { field: "hashtags", label: "Hashtags" },
];

/**
 * Output fields and character budgets per (copy type, channel). Drives the
 * generation JSON schema, the model's limit instructions, and the UI's
 * char-count badges — keep all three in sync by only editing here.
 */
export const CHANNEL_CONSTRAINTS: Record<
  CopyType,
  Record<string, CopyFieldConstraint[]>
> = {
  aggregator_offer: {
    foody: AGGREGATOR_FIELDS,
    bolt: AGGREGATOR_FIELDS,
    wolt: AGGREGATOR_FIELDS,
    efood: AGGREGATOR_FIELDS,
  },
  social_caption: {
    instagram: SOCIAL_FIELDS(2200),
    facebook: SOCIAL_FIELDS(1000),
    tiktok: SOCIAL_FIELDS(2200),
  },
  push_sms: {
    push: [
      { field: "title", label: "Title", maxLength: 65 },
      { field: "body", label: "Body", maxLength: 178 },
    ],
    sms: [{ field: "body", label: "Message", maxLength: 160 }],
  },
  banner_headline: {
    banner: [
      { field: "headline", label: "Headline", maxLength: 30 },
      { field: "subheadline", label: "Subheadline", maxLength: 60 },
      { field: "cta", label: "CTA", maxLength: 20 },
    ],
  },
};

export function isCopyType(value: unknown): value is CopyType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(CHANNELS_BY_TYPE, value)
  );
}

/** Fields for a (type, channel) pair, or null when the pair is unknown. */
export function getChannelConstraints(
  copyType: CopyType,
  channel: string,
): CopyFieldConstraint[] | null {
  return CHANNEL_CONSTRAINTS[copyType]?.[channel] ?? null;
}

export const VARIANT_COUNT_MIN = 1;
export const VARIANT_COUNT_MAX = 5;
export const VARIANT_COUNT_DEFAULT = 3;
