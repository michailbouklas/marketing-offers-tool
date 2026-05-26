import { env } from "$env/dynamic/private";
import { clickhouse } from "$lib/server/clickhouse";
import type { CurrentDimOffersValues } from "$lib/services/offers-data-quality";

type TransactionContextRow = {
  trde_item: string;
  item_name: string;
  item_category: string;
  brand: string;
};

type DimOffersRow = {
  item_code?: string | null;
  product_desc?: string | null;
  brand?: string | null;
  channel?: string | null;
  category?: string | null;
  subcategory?: string | null;
  ideal_price?: string | number | null;
  selling_price?: string | number | null;
  fc_perc?: string | number | null;
  mktg_spend?: string | number | null;
};

export type UpsertDimOfferInput = {
  item_code: string;
  product_desc: string;
  brand: string;
  channel: string;
  category: string;
  subcategory: string;
  ideal_price: string;
  selling_price: string;
  fc_perc: string;
  mktg_spend: string | null;
  discount_amount: string;
  notes: string | null;
};

export type DimOfferAuditSnapshot = {
  item_code: string;
  product_desc: string | null;
  brand_alias: string | null;
  channel: string | null;
  category: string | null;
  subcategory: string | null;
  ideal_price: string | null;
  selling_price: string | null;
  fc_perc: string | null;
  mktg_spend: string | null;
  discount_amount: string | null;
};

export type TransactionItemContext = {
  trde_item: string;
  item_name: string;
  item_category: string;
  brand: string;
};

export type MissingOfferQueueRow = {
  trde_item: string;
  item_name: string;
  brand: string;
  item_category: string;
  current_dim_offers: CurrentDimOffersValues;
};

const DEFAULT_LOOKBACK_DAYS = 90;
const DEFAULT_MISSING_OFFERS_SINCE = "2024-01-01";
const OFFER_ITEM_CATEGORIES = [
'Amount Of Money Offers','Bolt Offers PH','Call Center Offers','Call Center Offers KFC','FOODY Offers PH','FOODY RMS','FOODY RMS ALL BRANDS','Offers','Offers BK','Offers HOBO','Offers JMO','Offers KFC','Offers KYP','Offers NER','Offers PAT','Offers PAU','Offers PDE','Offers TAV','Offers VER','Online Offers','Online\\CK Offers','Pair Offers','PH Offers','Single Item Offers','Taco Bell Offers','Up Selling Offers','Wolt Offers','Wolt Offers WAG' 
] as const;

function parseLookbackDays(value: string | undefined) {
  if (!value) {
    return DEFAULT_LOOKBACK_DAYS;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LOOKBACK_DAYS;
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function subtractDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() - days);

  return next;
}

function parseNullableNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const parsed = Number.parseFloat(trimmedValue);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatNullableFixedNumber(
  value: string | number | null | undefined,
  digits: number,
) {
  const parsed = parseNullableNumber(value);

  return parsed === null ? null : parsed.toFixed(digits);
}

function getMissingOffersSinceDate() {
  return env.CLICKHOUSE_MISSING_OFFERS_SINCE || DEFAULT_MISSING_OFFERS_SINCE;
}

export async function getTransactionItemContext(
  trdeItem: string,
): Promise<TransactionItemContext | null> {
  const lookbackDate = formatDate(
    subtractDays(
      new Date(),
      parseLookbackDays(env.CLICKHOUSE_TRANSACTION_LOOKBACK_DAYS),
    ),
  );

  const result = await clickhouse.query({
    query: `
      SELECT
        trde_item,
        any(item_name) AS item_name,
        any(item_category) AS item_category,
        any(brand) AS brand
      FROM transaction_details
      WHERE trde_item = {trde_item:String}
        AND trde_item != '-1'
        AND trde_date >= {lookback_date:Date}
      GROUP BY trde_item
      LIMIT 1
    `,
    query_params: {
      trde_item: trdeItem,
      lookback_date: lookbackDate,
    },
    format: "JSONEachRow",
  });

  const rows = await result.json<TransactionContextRow>();

  return rows[0] ?? null;
}

export async function getCurrentDimOfferValues(
  trdeItem: string,
): Promise<CurrentDimOffersValues> {
  const result = await clickhouse.query({
    query: `
      SELECT
        channel,
        category,
        subcategory,
        ideal_price,
        selling_price,
        fc_perc,
        mktg_spend
      FROM dim_offers
      WHERE item_code = {item_code:String}
      LIMIT 1
    `,
    query_params: {
      item_code: trdeItem,
    },
    format: "JSONEachRow",
  });

  const rows = await result.json<DimOffersRow>();
  const row = rows[0];

  if (!row) {
    return {
      channel: null,
      category: null,
      subcategory: null,
      ideal_price: null,
      selling_price: null,
      fc_perc: null,
      mktg_spend: null,
    };
  }

  return {
    channel: row.channel ?? null,
    category: row.category ?? null,
    subcategory: row.subcategory ?? null,
    ideal_price: parseNullableNumber(row.ideal_price),
    selling_price: parseNullableNumber(row.selling_price),
    fc_perc: parseNullableNumber(row.fc_perc),
    mktg_spend: parseNullableNumber(row.mktg_spend),
  };
}

export async function getDimOfferAuditSnapshot(
  itemCode: string,
): Promise<DimOfferAuditSnapshot | null> {
  const result = await clickhouse.query({
    query: `
      SELECT
        item_code,
        product_desc,
        brand,
        channel,
        category,
        subcategory,
        ideal_price,
        selling_price,
        fc_perc,
        mktg_spend,
        discount_amount
      FROM dim_offers
      WHERE item_code = {item_code:String}
      LIMIT 1
    `,
    query_params: {
      item_code: itemCode,
    },
    format: "JSONEachRow",
  });

  const rows = await result.json<
    DimOffersRow & {
      discount_amount?: string | number | null;
    }
  >();
  const row = rows[0];

  if (!row?.item_code) {
    return null;
  }

  return {
    item_code: row.item_code,
    product_desc: row.product_desc ?? null,
    brand_alias: row.brand ?? null,
    channel: row.channel ?? null,
    category: row.category ?? null,
    subcategory: row.subcategory ?? null,
    ideal_price: formatNullableFixedNumber(row.ideal_price, 2),
    selling_price: formatNullableFixedNumber(row.selling_price, 2),
    fc_perc: formatNullableFixedNumber(row.fc_perc, 4),
    mktg_spend: formatNullableFixedNumber(row.mktg_spend, 2),
    discount_amount: formatNullableFixedNumber(row.discount_amount, 2),
  };
}

export async function dimOfferExists(itemCode: string) {
  const result = await clickhouse.query({
    query: `
      SELECT item_code
      FROM dim_offers
      WHERE item_code = {item_code:String}
      LIMIT 1
    `,
    query_params: {
      item_code: itemCode,
    },
    format: "JSONEachRow",
  });

  const rows = await result.json<Pick<DimOffersRow, "item_code">>();

  return rows.length > 0;
}

export async function listMissingOfferQueueRows(): Promise<
  MissingOfferQueueRow[]
> {
  const result = await clickhouse.query({
    query: `
      SELECT DISTINCT
        td.trde_item,
        td.item_name,
        td.brand,
        td.item_category,
        do.channel,
        do.category,
        do.subcategory,
        do.fc_perc,
        do.mktg_spend,
        do.ideal_price,
        do.selling_price
      FROM (
        SELECT DISTINCT trde_item, item_name, brand, item_category
        FROM transaction_details
        WHERE trde_date >= {since_date:Date}
          AND item_category IN ({offer_categories:Array(String)})
      ) td
      LEFT JOIN dim_offers do ON td.trde_item = do.item_code
      WHERE do.item_code IS NULL
        OR (do.item_code IS NOT NULL AND (do.ideal_price IS NULL OR do.ideal_price = 0))
    `,
    query_params: {
      since_date: getMissingOffersSinceDate(),
      offer_categories: [...OFFER_ITEM_CATEGORIES],
    },
    format: "JSONEachRow",
  });

  const rows = await result.json<
    TransactionContextRow &
      Pick<
        DimOffersRow,
        | "channel"
        | "category"
        | "subcategory"
        | "ideal_price"
        | "selling_price"
        | "fc_perc"
        | "mktg_spend"
      >
  >();

  return rows.map((row) => ({
    trde_item: row.trde_item,
    item_name: row.item_name,
    brand: row.brand,
    item_category: row.item_category,
    current_dim_offers: {
      channel: row.channel ?? null,
      category: row.category ?? null,
      subcategory: row.subcategory ?? null,
      ideal_price: parseNullableNumber(row.ideal_price),
      selling_price: parseNullableNumber(row.selling_price),
      fc_perc: parseNullableNumber(row.fc_perc),
      mktg_spend: parseNullableNumber(row.mktg_spend),
    },
  }));
}

export async function insertDimOffer(data: UpsertDimOfferInput) {
  return clickhouse.insert({
    table: "dim_offers",
    values: [
      {
        item_code: data.item_code,
        product_desc: data.product_desc,
        brand: data.brand,
        channel: data.channel,
        category: data.category,
        subcategory: data.subcategory,
        fc_perc: data.fc_perc,
        mktg_spend: data.mktg_spend,
        ideal_price: data.ideal_price,
        selling_price: data.selling_price,
        discount_amount: data.discount_amount,
        notes: data.notes,
      },
    ],
    format: "JSONEachRow",
  });
}

export async function updateDimOffer(data: UpsertDimOfferInput) {
  const marketingSpendValue = data.mktg_spend ?? "";
  const notesValue = data.notes ?? "";

  return clickhouse.command({
    query: `
      ALTER TABLE dim_offers
      UPDATE
        product_desc = {product_desc:String},
        brand = {brand:String},
        channel = {channel:String},
        category = {category:String},
        subcategory = {subcategory:String},
        ideal_price = toFloat32({ideal_price:String}),
        selling_price = toFloat32({selling_price:String}),
        fc_perc = toFloat32({fc_perc:String}),
        mktg_spend = {mktg_spend:String},
        discount_amount = toFloat32({discount_amount:String}),
        notes = nullIf({notes:String}, '')
      WHERE item_code = {item_code:String}
    `,
    query_params: {
      item_code: data.item_code,
      product_desc: data.product_desc,
      brand: data.brand,
      channel: data.channel,
      category: data.category,
      subcategory: data.subcategory,
      ideal_price: data.ideal_price,
      selling_price: data.selling_price,
      fc_perc: data.fc_perc,
      mktg_spend: marketingSpendValue,
      discount_amount: data.discount_amount,
      notes: notesValue,
    },
  });
}
