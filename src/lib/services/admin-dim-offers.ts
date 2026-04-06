export type AdminDimOfferRow = {
  item_code: string;
  product_desc: string | null;
  brand_alias: string | null;
  channel: string | null;
  category: string | null;
  subcategory: string | null;
  ideal_price: number | null;
  selling_price: number | null;
  fc_perc: number | null;
  mktg_spend: number | null;
  discount_amount: number | null;
  last_changed_at: string | null;
  last_changed_by: string | null;
  last_changed_by_name: string | null;
  last_changed_by_email: string | null;
};

export const adminDimOffersSortFields = [
  "item_code",
  "product_desc",
  "brand_alias",
  "channel",
  "category",
  "subcategory",
  "ideal_price",
  "selling_price",
  "fc_perc",
  "mktg_spend",
  "discount_amount",
] as const;

export const adminDimOffersSortDirections = ["asc", "desc"] as const;

export type AdminDimOffersSortBy = (typeof adminDimOffersSortFields)[number];

export type AdminDimOffersSortDir =
  (typeof adminDimOffersSortDirections)[number];

export type AdminDimOffersPage = {
  items: AdminDimOfferRow[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type AdminDimOfferAuditEntry = {
  id: number;
  item_code: string;
  action: "insert" | "update";
  source: "gap_approval";
  changed_by: string;
  changed_by_name: string | null;
  changed_by_email: string | null;
  changed_at: string;
  staging_id: number | null;
  dq_id: number | null;
  changed_fields: string[];
  before_values: AdminDimOfferRow | null;
  after_values: AdminDimOfferRow;
};

export type AdminDimOfferAuditPageData = {
  item: AdminDimOfferRow | null;
  audits: AdminDimOfferAuditEntry[];
};
