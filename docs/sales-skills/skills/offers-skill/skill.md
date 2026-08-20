---
name: offers-skill
description: explanation on how offers are recorded in the transaction_details` table  and how to identify whis item is the main offer item and which items are part of the offer.
version: 1.1.0
tags:
  - discount
  - offers
  - promotions
  - sales
  - discount value
  - analysis
---

# Skill: Understanding Offers in `transaction_details`

## Overview

This skill teaches how **offers, combos, and bundles** are recorded in the `transaction_details` table in the Novasero Sales database. Use this knowledge to correctly identify offer header rows, their component items, and the relationships between them.

If the ClickHouse table `dim_offers` is available and already has a `brand` column, treat `dim_offers.brand` as the canonical offer-brand field for lookups on that table.
Only fall back to deriving brand from `transaction_details.trde_item = dim_offers.item_code` when validating or backfilling old rows.

Offers are detected by filtering rows where `item_category` is in the following explicit list:

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
    'Online\CK Offers', 'Offers JMO', 'Offers HOBO', 'FOODY RMS ALL BRANDS',
    'Digital Coupons BK', 'Digital Coupons PH', 'Offers PAT', 'UoC Coupons NER'
)
```

> ⚠️ Do **not** use `item_category LIKE '%Offers%'` or `LIKE '%Coupon%'` as a substitute. Always use the explicit `IN` list above to avoid false positives or missed categories.

---

## ⚠️ Override Rule: Always Include Zero-Value Rows

> **This rule overrides any default filter that excludes zero-value rows.**

When querying offer-related rows, **do not apply** a filter such as `trde_net_price != 0` or `trde_net_value != 0`. Offer structures routinely include rows where both values are `0` — these are structurally significant and must be retained.

Rows where `trde_net_price = 0` or `trde_net_value = 0` can represent:

- The **offer header/parent row** (which often carries `trde_net_value > 0` but may not always)
- **Component rows** inside the offer bundle (which typically have `trde_net_value = 0`)
- **Promotional or structural rows** that define the offer but carry no independent revenue

**Always include rows where `trde_net_price = 0` or `trde_net_value = 0`** when the `item_category` matches the offer list. Filtering them out will break parent–child reconstruction and cause incomplete offer analysis.

---

## Core Concept: Parent–Child Structure

Offers are modeled as a **parent (header) row** plus one or more **child (component) rows** within the same transaction.

The key linking field is `trde_combo_item`, which acts as the parent offer reference for all rows in a bundle.

---

## Identifying the Offer Header Row

A row is the **offer/combo header** when:

```
trde_item = trde_combo_item
```

This means the row self-references itself as the root of the offer structure.

An additional strong indicator is:

```
trde_combo_item_pos = -1
```

When this value is present, it almost always confirms the row is the **combo name/header**, not a component.

**Practical rule — offer header:**

```
trde_item = trde_combo_item
AND/OR trde_combo_item_pos = -1
```

---

## Identifying Offer Component Rows

A row is an **included component** of the offer when:

```
trde_item != trde_combo_item
AND trde_combo_item = [parent offer's trde_item]
```

The `trde_combo_item` field on the component row points back to the `trde_item` of its parent offer header.

---

## Field Reference

| Field                   | Role in Offer Structure                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `transactionid`         | Groups all rows belonging to the same transaction                             |
| `trde_line`             | Identifies the main line within the transaction                               |
| `trde_sub_line`         | Distinguishes parent rows from subordinate rows                               |
| `trde_item`             | Item code of the current row                                                  |
| `trde_combo_item`       | Parent offer/combo reference; equals `trde_item` on the header row            |
| `trde_combo_item_pos`   | `-1` = offer header; `1, 2, 3…` = component position; `-999` = not used       |
| `trde_combo_item_group` | Logical grouping inside the offer (e.g. main, side, drink); `-999` = not used |
| `item_name`             | Business-readable name of the item or offer                                   |
| `item_category`         | Contains `'Offers'` for offer-related rows                                    |
| `brand`                 | Offer structure implementation may vary by brand                              |

---

## `dim_offers` Brand Rule

When reading from `dim_offers`:

- Prefer `dim_offers.brand` directly.
- If `dim_offers.brand` is still `NULL` during rollout, derive a fallback brand from `transaction_details` only when the item code maps to exactly one distinct brand.
- Do **not** use a plain `any(brand)` grouped by `trde_item` as a permanent rule, because some generic promo codes are reused across multiple brands.

Safe fallback pattern:

```sql
SELECT
  d.item_code,
  coalesce(d.brand, bm.brand) AS brand,
  d.product_desc,
  d.channel,
  d.category,
  d.subcategory
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

---

## `trde_combo_item_pos` Value Meanings

| Value        | Meaning                                               |
| ------------ | ----------------------------------------------------- |
| `-1`         | Offer/combo header row (strongest indicator)          |
| `1, 2, 3, …` | Component items inside the combo, in positional order |
| `-999`       | Positional structure not populated / not applicable   |

---

## `trde_combo_item_group` Value Meanings

| Value     | Meaning                                                             |
| --------- | ------------------------------------------------------------------- |
| `1, 2, …` | Active grouping in use (e.g. main item, side, drink, upgrade group) |
| `-999`    | Grouping not populated / not applicable                             |

---

## Financial Behaviour

**Header row** — carries the commercial value of the offer:

- `trde_net_value` — revenue of the combo/offer
- `trde_normal_price` — standard price before adjustments
- `trde_discount` / `trde_line_discount` — any discounts applied

**Component rows** — typically informational/structural:

- `trde_net_value = 0` in most cases
- They exist to record what was included in the bundle, not to carry independent revenue

> ⚠️ This pattern is common but not universal across all brands. Treat it as the default, not an absolute rule.

---

## Offer Structure Patterns

### Pattern A — Structured Combo Model

The most explicit and consistent structure:

- One parent/header row represents the sold combo
- Child rows represent included items
- Child rows link back to the parent via `trde_combo_item`
- `trde_combo_item_pos` is meaningfully populated

| Row Type  | Typical Field Values                                                                  |
| --------- | ------------------------------------------------------------------------------------- |
| Header    | `trde_item = trde_combo_item`, `trde_combo_item_pos = -1`, `trde_net_value > 0`       |
| Component | `trde_combo_item = parent item code`, `trde_combo_item_pos > 0`, `trde_net_value = 0` |

### Pattern B — Parent/Subline Offer Model

A looser structure where combo-position metadata is absent:

- Parent–child relationship still exists via `trde_combo_item`
- `trde_combo_item_pos` and `trde_combo_item_group` are both `-999`
- Structure must be reconstructed using `transactionid`, `trde_line`, `trde_sub_line`, and `trde_combo_item`

| Row Type  | Typical Field Values                                                                          |
| --------- | --------------------------------------------------------------------------------------------- |
| Header    | `trde_item = trde_combo_item`                                                                 |
| Component | `trde_combo_item = parent item`, `trde_combo_item_pos = -999`, `trde_combo_item_group = -999` |

---

## Step-by-Step Logic for Identifying Offers

**Step 1 — Detect candidate offer rows**

```sql
WHERE item_category IN (
    'FOODY RMS', 'Offers NER', 'Offers PAU', 'Offers PDE', 'Offers TAV',
    'Pair Offers', 'Coupons PH', 'PH Offers', 'Single Item Offers',
    'Discount Offers', 'Offers KFC', 'Call Center Offers KFC',
    'Amount Of Money Offers', 'Coupons NER', 'Coupons', 'Online Offers',
    'Coupons TAV', 'Offers VER', 'Wolt Offers', 'Taco Bell Offers',
    'FOODY Offers PH', 'Bolt Offers PH', 'Offers BK', 'King Savers',
    'Taco Bell Coupons', 'Offers', 'Coupons WAG', 'Coupons VER',
    'Offers KYP', 'Coupons BK', 'Call Center Offers', 'Wolt Offers WAG',
    'Online\CK Offers', 'Offers JMO', 'Offers HOBO', 'FOODY RMS ALL BRANDS',
    'Digital Coupons BK', 'Digital Coupons PH', 'Offers PAT', 'UoC Coupons NER'
)
```

**Step 2 — Identify the offer header**

```sql
WHERE trde_item = trde_combo_item
-- and/or
WHERE trde_combo_item_pos = -1
```

**Step 3 — Identify included components**

```sql
WHERE trde_combo_item = [parent trde_item]
  AND trde_item != trde_combo_item
```

**Step 4 — Use position/group metadata when available**

- Use `trde_combo_item_pos` to distinguish header (`-1`) from components (`> 0`)
- Use `trde_combo_item_group` to separate logical groups within the offer

**Step 5 — Fall back to line/subline logic when metadata is absent**

When `trde_combo_item_pos = -999` or `trde_combo_item_group = -999`, reconstruct the relationship using:

- `transactionid`
- `trde_line`
- `trde_sub_line`
- `trde_combo_item`

---

## Summary — Operational Rules

```
OFFER HEADER:
  trde_item = trde_combo_item
  AND/OR trde_combo_item_pos = -1

OFFER COMPONENT:
  trde_item != trde_combo_item
  AND trde_combo_item = [parent offer's trde_item]
```

---

## Plain-Language Summary

> In `transaction_details`, offers are modelled as a parent item plus child component rows. The parent offer row self-references through `trde_combo_item`, while included items reference that parent offer item in their own `trde_combo_item` field. When available, `trde_combo_item_pos = -1` indicates the offer header row, and positive positions indicate included components. Implementation details may vary by brand, so the logic should be applied with flexibility.

## Example query to pull top 3 items that belong in a '1 plus 1' offer

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
   --AND td.item_category LIKE '%Pizza%'
   AND td.trde_combo_item IN (
          SELECT DISTINCT od.trde_item
       FROM transaction_details AS od
       WHERE od.brand = 'phcy'
         AND od.trde_date >= toDate('2026-01-01')
         AND od.trde_date <= toDate('2026-12-31')
         AND od.trde_item != '-1'
         AND od.item_category in (
'FOODY RMS','Offers NER','Offers PAU','Offers PDE','Offers TAV','Pair Offers',
			'Coupons PH','PH Offers','Single Item Offers','Discount Offers','Offers KFC','Call Center Offers KFC','Amount Of Money Offers',
			'Coupons NER','Coupons','Online Offers','Coupons TAV','Offers VER','Wolt Offers','Taco Bell Offers','FOODY Offers PH','Bolt Offers PH',
			'Offers BK','King Savers','Taco Bell Coupons','Offers','Coupons WAG','Coupons VER','Offers KYP','Coupons BK',
			'Call Center Offers','Wolt Offers WAG','Online\CK Offers','Offers JMO','Offers HOBO','FOODY RMS ALL BRANDS','Digital Coupons BK','Digital Coupons PH','Offers PAT','UoC Coupons NER'
 )
         AND od.trde_item = od.trde_combo_item
         AND positionCaseInsensitive(od.item_name, '1 plus 1') > 0
   )
 GROUP BY td.item_name
 ORDER BY qty_sold DESC, revenue_eur DESC
 LIMIT 3
```
