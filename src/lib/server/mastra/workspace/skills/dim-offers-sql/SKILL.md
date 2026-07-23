---
name: dim-offers-sql
description: Full schema reference and proven SQL query patterns for the offers pricing data in ClickHouse (dim_offers current pricing per item, plus transaction_details and apidata_replica.dim_items for item/brand context).
---

# Offers pricing SQL (ClickHouse)

ClickHouse database. This holds the **current, live pricing** of offer items
(`dim_offers`) plus the transaction/item context used to detect which items
are missing pricing. The gap queue, submissions, and approval workflow live
in PostgreSQL — use the `data-quality-sql` skill / `query-data-quality-sql`
tool for those.

Use unqualified names for the default-database tables (`dim_offers`,
`transaction_details`); the item dimension is in another database and MUST be
referenced as `apidata_replica.dim_items`.

## Tables

### dim_offers — current pricing per offer item

One row per `item_code`.

| Column          | Type   | Notes                                                                       |
| --------------- | ------ | --------------------------------------------------------------------------- |
| item_code       | String | Item code (joins to transaction_details.trde_item)                          |
| product_desc    | String | Product description                                                         |
| brand           | String | Brand (matches the app brand alias)                                         |
| channel         | String | Sales channel                                                               |
| category        | String | Pricing category                                                            |
| subcategory     | String | Pricing subcategory                                                         |
| ideal_price     | Float  | Ideal price, EUR. NULL/0 means "not set"                                    |
| selling_price   | Float  | Selling price, EUR                                                          |
| fc_perc         | Float  | Food-cost **fraction** (0–1; ×100 for a percentage). NULL/0 means "not set" |
| mktg_spend      | Float  | Marketing spend, EUR (nullable)                                             |
| discount_amount | Float  | Discount amount, EUR                                                        |
| notes           | String | Free-text notes (nullable)                                                  |

A "missing offer pricing" item is one where there is no `dim_offers` row for
the `item_code`, or the row exists but `ideal_price IS NULL OR ideal_price = 0`.

### transaction_details — transaction lines (large; always scope by date)

| Column        | Type   | Notes                                         |
| ------------- | ------ | --------------------------------------------- |
| trde_item     | String | Item code (`'-1'` is a sentinel — exclude it) |
| trde_date     | Date   | Transaction date — always filter on this      |
| brand         | String | Brand of the transaction                      |
| item_name     | String | Item name (when present)                      |
| item_category | String | Item category (when present)                  |

### apidata_replica.dim_items — item dimension

| Column           | Type   | Notes                                  |
| ---------------- | ------ | -------------------------------------- |
| item_code        | String | Joins to transaction_details.trde_item |
| item_description | String | Canonical item description             |
| item_category    | String | Canonical item category                |
| item_active      | UInt8  | 1 = active; filter `item_active = 1`   |

## Semantics

- All monetary values are EUR. `fc_perc` is a 0–1 fraction — present ×100.
- Treat `ideal_price`/`fc_perc` of NULL **or 0** as "not set" (this is how the
  app decides an item still has a pricing gap).
- `dim_offers` is keyed by `item_code` (one current row per item) — no `FINAL`
  is needed. If you ever see duplicate `item_code`s, group by it.
- The offer-item universe is scoped to specific `dim_items.item_category`
  values (the "Offers"-family categories). When counting the offer catalogue,
  join to `dim_items` and filter `item_active = 1`.
- Per-brand questions filter on `brand` (case-insensitive), e.g.
  `lower(brand) IN ('brandalias', ...)`.

## Query patterns

Items with missing / zero ideal pricing:

```sql
SELECT count() AS missing_pricing
FROM dim_offers
WHERE ideal_price IS NULL OR ideal_price = 0
```

Current pricing for one item:

```sql
SELECT item_code, product_desc, brand, channel, category, subcategory,
       ideal_price, selling_price, fc_perc, mktg_spend, discount_amount
FROM dim_offers
WHERE item_code = {code:String}
```

Average selling price and food-cost by brand (only priced rows):

```sql
SELECT brand,
       count() AS items,
       round(avg(selling_price), 2) AS avg_selling_price,
       round(avg(fc_perc) * 100, 2) AS avg_fc_pct
FROM dim_offers
WHERE ideal_price > 0
GROUP BY brand
ORDER BY items DESC
```

Offer items seen in transactions that have no priced dim_offers row
(the "gap" universe), by brand:

```sql
SELECT t.brand, count(DISTINCT t.trde_item) AS ungpriced_items
FROM (
  SELECT DISTINCT td.trde_item, td.brand
  FROM transaction_details td
  INNER JOIN apidata_replica.dim_items di ON di.item_code = td.trde_item
  WHERE td.trde_date >= toDate('2024-01-01')
    AND td.trde_item != '-1'
    AND di.item_active = 1
) t
LEFT JOIN dim_offers do ON do.item_code = t.trde_item
WHERE do.item_code = '' OR do.ideal_price IS NULL OR do.ideal_price = 0
GROUP BY t.brand
ORDER BY ungpriced_items DESC
```

## Gotchas

- Always qualify the item dimension as `apidata_replica.dim_items`; the schema
  guard rejects `system.`/`information_schema.` but allows this cross-database
  reference.
- `transaction_details` is large — always filter on `trde_date` and exclude the
  `'-1'` sentinel `trde_item`.
- The tool caps results at 200 rows — aggregate instead of listing.
- Case-insensitive text search: `positionCaseInsensitiveUTF8(col, 'term') > 0`.
- The workflow state (open/submitted gaps, pending submissions) is NOT here —
  it is in PostgreSQL. Use the `query-data-quality-sql` tool for it.
