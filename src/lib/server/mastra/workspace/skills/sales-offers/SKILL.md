---
name: sales-offers
description: How offers, bundles, and non-captured discounts are recorded in transaction_details — header/component parent-child structure, the explicit offer item_category list, the zero-value override rule, and dim_offers brand rules.
---

# Understanding Offers in `transaction_details`

Offers, combos, and bundles are recorded as structured row groups in
`transaction_details`. Use this to identify offer header rows, their
component items, and the relationships between them.

If the ClickHouse table `dim_offers` is available and has a `brand` column,
treat `dim_offers.brand` as the canonical offer-brand field for lookups on
that table. Only fall back to deriving brand from
`transaction_details.trde_item = dim_offers.item_code` when validating or
backfilling old rows.

Offers are detected by filtering rows where `item_category` is in this
explicit list:

```sql
item_category IN (
    'FOODY RMS', 'Offers NER', 'Offers PAU', 'Offers PDE', 'Offers TAV',
    'Pair Offers', 'Coupons PH', 'PH Offers', 'Single Item Offers',
    'Discount Offers', 'Offers KFC', 'Call Center Offers KFC',
    'Amount Of Money Offers', 'Coupons NER', 'Coupons', 'Online Offers',
    'Coupons TAV', 'Offers VER', 'Wolt Offers', 'Taco Bell Offers',
    'FOODY Offers PH', 'Bolt Offers PH', 'Offers BK', 'King Savers',
    'Taco Bell Coupons', 'Offers', 'Coupons WAG', 'Coupons VER',
    'Offers KYP', 'Coupons BK', 'Call Center Offers', 'Wolt Offers WAG',
    'Online\\CK Offers', 'Offers JMO', 'Offers HOBO', 'FOODY RMS ALL BRANDS',
    'Digital Coupons BK', 'Digital Coupons PH', 'Offers PAT', 'UoC Coupons NER'
)
```

> ⚠️ Do **not** use `item_category LIKE '%Offers%'` or `LIKE '%Coupon%'` as a
> substitute. Always use the explicit `IN` list to avoid false positives or
> missed categories.

## ⚠️ Override Rule: Always Include Zero-Value Rows

> **This rule overrides the default filter that excludes zero-value rows.**

When querying offer-related rows, do NOT apply `trde_net_price != 0` or
`trde_net_value != 0`. Offer structures routinely include rows where both are
`0` — these are structurally significant:

- The **offer header/parent row** (often carries `trde_net_value > 0`, but
  not always)
- **Component rows** inside the bundle (typically `trde_net_value = 0`)
- **Promotional/structural rows** defining the offer without revenue

Filtering them out breaks parent–child reconstruction.

## Core Concept: Parent–Child Structure

Offers are modeled as a **parent (header) row** plus one or more **child
(component) rows** within the same transaction. The linking field is
`trde_combo_item`, which acts as the parent offer reference for all rows in a
bundle.

### Offer header row

```
trde_item = trde_combo_item        -- self-references as the root
AND/OR trde_combo_item_pos = -1    -- strongest confirmation when present
```

### Offer component rows

```
trde_item != trde_combo_item
AND trde_combo_item = [parent offer's trde_item]
```

## Field Reference

| Field                     | Role in Offer Structure                                             |
| ------------------------- | ------------------------------------------------------------------- |
| transactionid             | Groups all rows of the same transaction                             |
| trde_line / trde_sub_line | Line structure; parent vs subordinate rows                          |
| trde_item                 | Item code of the current row                                        |
| trde_combo_item           | Parent offer reference; equals trde_item on the header              |
| trde_combo_item_pos       | `-1` = header; `1,2,3…` = component position; `-999` = not used     |
| trde_combo_item_group     | Logical group inside the offer (main/side/drink); `-999` = not used |
| item_name                 | Business-readable name                                              |
| item_category             | In the offers list above for offer-related rows                     |
| brand                     | Structure may vary by brand — apply logic with flexibility          |

## `dim_offers` Brand Rule

- Prefer `dim_offers.brand` directly.
- If it is NULL during rollout, derive a fallback brand from
  `transaction_details` only when the item code maps to exactly one brand.
- Do NOT use plain `any(brand)` grouped by trde_item as a permanent rule —
  generic promo codes are reused across brands.

```sql
SELECT
  d.item_code,
  coalesce(d.brand, bm.brand) AS brand,
  d.product_desc, d.channel, d.category, d.subcategory
FROM dim_offers AS d
LEFT JOIN (
  SELECT
    trde_item AS item_code,
    if(uniqExact(brand) = 1, any(brand), CAST(NULL, 'Nullable(String)')) AS brand
  FROM transaction_details
  WHERE trde_item != '-1'
  GROUP BY trde_item
) AS bm
  ON bm.item_code = d.item_code
```

## Financial Behaviour

**Header row** carries the commercial value: trde_net_value (revenue of the
offer), trde_normal_price (standard price), trde_discount /
trde_line_discount. **Component rows** are typically structural with
`trde_net_value = 0` — they record what was included, not revenue.

> Common but not universal across brands — treat as the default, not an
> absolute rule.

## Structure Patterns

### Pattern A — Structured Combo Model

| Row Type  | Typical Field Values                                                            |
| --------- | ------------------------------------------------------------------------------- |
| Header    | trde_item = trde_combo_item, trde_combo_item_pos = -1, trde_net_value > 0       |
| Component | trde_combo_item = parent item code, trde_combo_item_pos > 0, trde_net_value = 0 |

### Pattern B — Parent/Subline Model (position metadata absent)

| Row Type  | Typical Field Values                                                                    |
| --------- | --------------------------------------------------------------------------------------- |
| Header    | trde_item = trde_combo_item                                                             |
| Component | trde_combo_item = parent item, trde_combo_item_pos = -999, trde_combo_item_group = -999 |

Reconstruct Pattern B using transactionid, trde_line, trde_sub_line, and
trde_combo_item.

## Step-by-Step Logic

1. Detect candidate offer rows with the explicit item_category IN list.
2. Identify the header: `trde_item = trde_combo_item` and/or
   `trde_combo_item_pos = -1`.
3. Identify components: `trde_combo_item = [parent trde_item] AND
trde_item != trde_combo_item`.
4. Use trde_combo_item_pos / trde_combo_item_group when populated.
5. Fall back to line/subline logic when both are `-999`.

## Example — top 3 items sold inside a "1 plus 1" offer

```sql
SELECT
    td.item_name AS pizza_item,
    round(sum(td.trde_qty * td.trde_qty_ratio), 2) AS qty_sold,
    round(sum(td.trde_net_value), 2) AS revenue_eur
FROM transaction_details AS td
WHERE td.brand = 'phcy'
  AND td.trde_date >= toDate('2026-01-01')
  AND td.trde_date <= toDate('2026-12-31')
  AND td.trde_item != '-1'
  AND td.trde_void_time = ''
  AND td.trde_combo_item IN (
      SELECT DISTINCT od.trde_item
      FROM transaction_details AS od
      WHERE od.brand = 'phcy'
        AND od.trde_date >= toDate('2026-01-01')
        AND od.trde_date <= toDate('2026-12-31')
        AND od.trde_item != '-1'
        AND od.item_category IN (
            'FOODY RMS', 'Offers NER', 'Offers PAU', 'Offers PDE', 'Offers TAV',
            'Pair Offers', 'Coupons PH', 'PH Offers', 'Single Item Offers',
            'Discount Offers', 'Offers KFC', 'Call Center Offers KFC',
            'Amount Of Money Offers', 'Coupons NER', 'Coupons', 'Online Offers',
            'Coupons TAV', 'Offers VER', 'Wolt Offers', 'Taco Bell Offers',
            'FOODY Offers PH', 'Bolt Offers PH', 'Offers BK', 'King Savers',
            'Taco Bell Coupons', 'Offers', 'Coupons WAG', 'Coupons VER',
            'Offers KYP', 'Coupons BK', 'Call Center Offers', 'Wolt Offers WAG',
            'Online\\CK Offers', 'Offers JMO', 'Offers HOBO', 'FOODY RMS ALL BRANDS',
            'Digital Coupons BK', 'Digital Coupons PH', 'Offers PAT', 'UoC Coupons NER'
        )
        AND od.trde_item = od.trde_combo_item
        AND positionCaseInsensitive(od.item_name, '1 plus 1') > 0
  )
GROUP BY td.item_name
ORDER BY qty_sold DESC, revenue_eur DESC
LIMIT 3
```

## Summary — Operational Rules

```
OFFER HEADER:
  trde_item = trde_combo_item
  AND/OR trde_combo_item_pos = -1

OFFER COMPONENT:
  trde_item != trde_combo_item
  AND trde_combo_item = [parent offer's trde_item]
```

> In `transaction_details`, offers are a parent item plus child component
> rows. The parent self-references through trde_combo_item; components point
> back to it. `trde_combo_item_pos = -1` marks the header when available.
> Implementation varies by brand — apply with flexibility.
