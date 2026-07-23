---
name: sales-coupons
description: How coupons and coupon-driven discounts are recorded in transaction_details — coupon marker rows vs affected sale rows, linkage via trde_coupon and trde_combo_item, and financial caveats.
---

# Understanding Coupons in `transaction_details`

Coupons, coupon-driven offers, and discount markers are modelled differently
from sold combos — they act primarily as **promotion markers** rather than
sold products.

Coupon transactions are detected by filtering:

```sql
item_category LIKE '%Coupon%'
```

## Core Concept: Marker + Affected Item Structure

A coupon is a **coupon marker row** (the promotion event) paired with one or
more **affected sale rows** (the purchased items receiving the discount). The
linking fields are `trde_coupon` and `trde_combo_item`.

### Coupon marker row

Represents the discount event itself, carries the coupon code but **no
revenue**:

```
item_category LIKE '%Coupon%'
AND trde_coupon IS NOT EMPTY
AND trde_net_value = 0
AND/OR trde_item = trde_combo_item
```

### Coupon-affected sale rows

Carry the actual revenue and discount, linked back to the marker:

```
trde_net_value > 0
AND trde_discount and/or trde_line_discount may be populated
AND (
    trde_coupon = [coupon marker's trde_coupon]
    OR trde_combo_item = [coupon marker's trde_item]
)
```

## Field Reference

| Field                              | Role in Coupon Structure                                               |
| ---------------------------------- | ---------------------------------------------------------------------- |
| transactionid                      | Groups all rows in the same transaction                                |
| trde_line / trde_sub_line          | Parent vs subordinate rows                                             |
| trde_item                          | Item code of the current row                                           |
| trde_combo_item                    | Promotional parent reference; equals trde_item on the marker row       |
| trde_coupon                        | The explicit coupon/promo code — **primary field for coupon analysis** |
| trde_coupon_group                  | Often defaults to 0 — not reliable as a primary key                    |
| trde_net_value                     | 0 on marker rows; > 0 on affected sale rows                            |
| trde_discount / trde_line_discount | Discounts on affected sale rows                                        |
| trde_is_master_item                | NOT a reliable coupon-header indicator — do not use as primary key     |
| item_name                          | Promotion description on markers; product name on sale rows            |
| item_category                      | Contains 'Coupon' for marker rows                                      |
| brand                              | Implementation may vary by brand                                       |

## `trde_coupon` — Primary Analytical Field

| Context           | Behaviour                               |
| ----------------- | --------------------------------------- |
| Coupon marker row | Always populated                        |
| Affected sale row | Often also populated with the same code |
| Not involved      | Empty / null                            |

Use it to: count usage frequency per coupon code, identify products affected
by a coupon, measure discount and revenue impact by coupon code.

## Financial Behaviour

| Row Type          | trde_net_value | Discount Fields                              | Purpose                             |
| ----------------- | -------------- | -------------------------------------------- | ----------------------------------- |
| Coupon marker     | = 0            | Usually empty                                | Promotion marker                    |
| Affected sale row | > 0            | trde_discount / trde_line_discount populated | Carries actual revenue and discount |

> ⚠️ Never measure coupon revenue impact from the marker row — always use the
> affected sale rows.

## Linkage Pattern

```
Coupon marker:   trde_item = trde_combo_item = [coupon offer code]
Affected row:    trde_combo_item = [coupon offer code]
                 trde_coupon     = [same coupon code]
```

Use `trde_coupon`, `trde_combo_item`, and `transactionid` together (plus
`trde_line`/`trde_sub_line` when metadata is absent) to reliably link marker
rows to affected sale rows.

## Fields to Deprioritise

| Field               | Why                                                              |
| ------------------- | ---------------------------------------------------------------- |
| trde_combo_item_pos | Less meaningful for coupons than combos; -999 appears frequently |
| trde_coupon_group   | Often defaults to 0; insufficient variation                      |
| trde_is_master_item | Did not reliably distinguish marker rows in reviewed data        |

## Step-by-Step Logic

1. Detect candidates: `item_category LIKE '%Coupon%'`.
2. Identify the marker: `trde_coupon` populated AND `trde_net_value = 0`
   (and/or `trde_item = trde_combo_item`).
3. Identify affected items: linked by trde_coupon / trde_combo_item with
   `trde_net_value > 0`.
4. Measure impact on the affected rows: discounted revenue (trde_net_value),
   total discount (trde_discount / trde_line_discount), usage frequency
   (count by trde_coupon), product-level impact.

## Caveats

1. Coupon marker rows are not sold items — never treat one as a product sale.
2. Revenue is always on the product row.
3. Linkage may need more than one field — combine trde_coupon,
   trde_combo_item, and transactionid.
4. Structure may vary by brand or channel — apply logic with flexibility.

## Summary — Operational Rules

```
COUPON MARKER ROW:
  item_category LIKE '%Coupon%'
  AND trde_coupon IS NOT EMPTY
  AND trde_net_value = 0
  AND/OR trde_item = trde_combo_item

COUPON-AFFECTED SALE ROW:
  trde_net_value > 0
  AND trde_discount and/or trde_line_discount may be populated
  AND linked by trde_coupon and/or trde_combo_item
```
