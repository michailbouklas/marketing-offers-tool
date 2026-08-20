---
name: coupons-skill
description: explanation on how are coupons recorded in the transaction_details table and how to distinguish the coupon item from the affected items.
version: 1.0.0
tags:
  - coupon
  - item
  - discount
  - analysis
---

# Skill: Understanding Coupons in `transaction_details`

## Overview

This skill teaches how **coupons, coupon-driven offers, and discount markers** are recorded in the `transaction_details` table in the Novasero Sales database. Coupons are modelled differently from sold combos — they act primarily as **promotion markers** rather than sold products.

Coupon transactions are detected by filtering rows where:

```sql
item_category LIKE '%Coupon%'
```

---

## Core Concept: Marker + Affected Item Structure

Coupons are modelled as a **coupon marker row** (representing the promotion event) paired with one or more **affected sale rows** (the actual purchased items receiving the discount).

The key linking fields are `trde_coupon` and `trde_combo_item`.

---

## Identifying the Coupon Marker Row

A row is the **coupon/promotion marker** when it represents the discount event itself rather than a sold product.

Typical characteristics:

```
item_category LIKE '%Coupon%'
AND trde_coupon IS NOT NULL / NOT EMPTY
AND trde_net_value = 0
AND often: trde_item = trde_combo_item
```

> The coupon marker row defines the promotional logic and carries the coupon code. It does **not** carry revenue.

**Practical rule — coupon marker:**

```
item_category LIKE '%Coupon%'
AND trde_coupon IS NOT EMPTY
AND trde_net_value = 0
AND/OR trde_item = trde_combo_item
```

---

## Identifying Coupon-Affected Sale Rows

A row is a **coupon-affected sold item** when it carries the actual revenue and discount, linked back to the coupon marker.

Typical characteristics:

```
trde_net_value > 0
AND trde_discount and/or trde_line_discount may be populated
AND (
    trde_coupon = [coupon marker's trde_coupon]
    OR trde_combo_item = [coupon marker's trde_item]
)
```

> Revenue and discount amounts sit on these rows, not on the coupon marker row.

---

## Field Reference

| Field                 | Role in Coupon Structure                                                          |
| --------------------- | --------------------------------------------------------------------------------- |
| `transactionid`       | Groups all rows in the same transaction                                           |
| `trde_line`           | Identifies the main line within the transaction                                   |
| `trde_sub_line`       | Distinguishes parent rows from subordinate rows                                   |
| `trde_item`           | Item code of the current row                                                      |
| `trde_combo_item`     | Acts as promotional parent reference; equals `trde_item` on the coupon marker row |
| `trde_coupon`         | The explicit coupon/promo code — primary field for coupon analysis                |
| `trde_coupon_group`   | Grouping field; often defaults to `0` — not reliable as a primary key             |
| `trde_net_value`      | `0` on coupon marker rows; `> 0` on affected sale rows                            |
| `trde_discount`       | Discount applied to an affected sale row                                          |
| `trde_line_discount`  | Line-level discount on an affected sale row                                       |
| `trde_is_master_item` | Not a reliable indicator of coupon header rows — do not use as primary key        |
| `item_name`           | Describes the promotion on marker rows; product name on sale rows                 |
| `item_category`       | Contains `'Coupon'` for coupon marker rows                                        |
| `brand`               | Coupon structure implementation may vary by brand                                 |

---

## `trde_coupon` — Primary Analytical Field

`trde_coupon` is the most direct field representing the coupon or promo code applied in a transaction.

| Context           | Behaviour                               |
| ----------------- | --------------------------------------- |
| Coupon marker row | Always populated                        |
| Affected sale row | Often also populated with the same code |
| Not involved      | Empty / null                            |

**Key use cases for `trde_coupon`:**

- Count usage frequency per coupon code
- Identify which products were affected by a specific coupon
- Measure discount and revenue impact by coupon code

---

## Financial Behaviour

| Row Type          | `trde_net_value` | Discount Fields                                       | Purpose                               |
| ----------------- | ---------------- | ----------------------------------------------------- | ------------------------------------- |
| Coupon marker     | `= 0`            | Usually empty                                         | Promotion marker / discount container |
| Affected sale row | `> 0`            | `trde_discount` and/or `trde_line_discount` populated | Carries actual revenue and discount   |

> ⚠️ Do not measure coupon revenue impact from the coupon marker row. Always use the affected sale rows.

---

## How Coupon Rows Link to Sale Rows

The relationship between the coupon marker and the affected items is reconstructed using a combination of fields:

| Field                         | Linkage Role                                                       |
| ----------------------------- | ------------------------------------------------------------------ |
| `trde_coupon`                 | Shared coupon code across marker and affected rows                 |
| `trde_combo_item`             | Affected rows point to coupon marker's `trde_item`                 |
| `transactionid`               | Scopes all rows to the same transaction                            |
| `trde_line` / `trde_sub_line` | Supports parent–child reconstruction when other metadata is absent |

**Typical linkage pattern:**

```
Coupon marker:   trde_item = trde_combo_item = [coupon offer code]
Affected row:    trde_combo_item = [coupon offer code]
                 trde_coupon     = [same coupon code]
```

---

## Fields to Deprioritise for Coupon Analysis

| Field                 | Why to Deprioritise                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `trde_combo_item_pos` | Less consistently meaningful for coupons than for structured combos; `-999` appears frequently |
| `trde_coupon_group`   | Often defaults to `0`; insufficient variation observed to be a reliable key                    |
| `trde_is_master_item` | Did not reliably distinguish coupon marker rows from affected sale rows in reviewed data       |

For coupon analysis, prioritise `trde_coupon`, `trde_combo_item`, and `transactionid` instead.

---

## Step-by-Step Logic for Identifying Coupons

**Step 1 — Detect candidate coupon transactions**

```sql
WHERE item_category LIKE '%Coupon%'
```

**Step 2 — Identify the coupon marker row**

```sql
WHERE trde_coupon IS NOT NULL
  AND trde_net_value = 0
-- and/or
  AND trde_item = trde_combo_item
```

**Step 3 — Identify affected sold items**

```sql
WHERE trde_coupon = [coupon marker's trde_coupon]
-- and/or
   OR trde_combo_item = [coupon marker's trde_item]
AND trde_net_value > 0
```

**Step 4 — Measure commercial impact**

Using the affected sale rows, calculate:

- Discounted revenue (`trde_net_value`)
- Total discount value (`trde_discount` / `trde_line_discount`)
- Coupon usage frequency (count by `trde_coupon`)
- Product-level coupon impact

---

## Important Analytical Caveats

**1. Coupon rows are not sold items**
A coupon marker row may look like a normal line item but is financially a marker only. Do not treat it as a product sale.

**2. Revenue is always on the product row**
Never measure coupon revenue impact from the coupon marker row itself.

**3. Linkage may require more than one field**
Use `trde_coupon`, `trde_combo_item`, and `transactionid` together to reliably link marker rows to affected sale rows.

**4. Structure may vary by brand**
As with offers, implementation details may differ across brands or channels. Apply logic with flexibility.

---

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

---

## Plain-Language Summary

> In `transaction_details`, coupons are usually represented by a separate promotion row and one or more affected product rows. The coupon row often has zero net value and contains the coupon code, while the actual sold product rows carry the revenue and discount amounts. Coupon-related rows can usually be linked through `trde_coupon`, `trde_combo_item`, and `transactionid`.
