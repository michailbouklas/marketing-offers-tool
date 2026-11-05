---
name: combo-item-analysis
description: Query patterns for analysing combo meals and meal deals in the Novasero sales data, including bundle performance, and combo revenue breakdown.
version: 1.0.0
tags:
  - combo
  - meal-deal
  - items
  - bundle
  - analytics
---

# Combo Item Analysis

No table flags an item as a combo (not `dim_items`, not SAP). The POS writes
the combo structure into `transaction_details`. Verified on live data
2026-11-05.

## Key Fields (transaction_details)

- `trde_combo_item_pos` (Int16): the structural signal.
  - `-1`: **combo header**, the combo/bundle itself. It carries the price.
  - `1, 2, 3…`: **component** of the header named in `trde_combo_item`,
    usually at €0 net.
  - `-999`: standalone line, no combo structure.
- `trde_combo_item` (String): the header code a line belongs to. Standalone
  and header lines **point at themselves** (`trde_combo_item = trde_item`);
  it is not empty for standalone lines.
- `trde_combo_item_group` (Int16): which combo instance in the order (the
  1st meal, the 2nd meal…), not a position.
- `trde_is_master_item` (Int32): **1 on every line. Do not use it.**
- `trde_sub_line` (Int16): 0 = head line, > 0 = sub-line under a head line.
  Sub-lines hold modifiers, sauces and, at BK, most meal drinks (recorded
  under the fries). Components can be head lines or sub-lines.
- `item_category`: meal-deal categories (`Combo Meals`, `Regular Buckets`,
  `Taco Bell Combos`…) mark meal deals. ~17k meal lines a week in them carry
  `pos = -999`: sold with no components recorded.

## Relationship

One combo sold writes:

- one header line: `trde_item = trde_combo_item = <combo code>`, normally
  `trde_combo_item_pos = -1`, usually priced;
- its components: every line (head or sub) with
  `trde_combo_item = <combo code>` and `trde_item != <combo code>`. Usually
  €0, but in some orders the combo price is split across the components
  (BK `1517` burger: 6.6k of 21k component lines priced).

Example (BK, 2026-11-03): `1517001 Chicken Royale Meal` pos -1 €5.12 →
`1517` burger pos 1 €0, `1553001` fries pos 2 €0 with an apple juice
sub-line, then ice / ketchup / mayo pos 3–5 €0.

`pos = -1` also marks other bundles: offers and coupons (`Pair Offers`,
`Any Medium Pizza €7.99`), Hobo `Combo Breakfast`, and a few products sold
with a free dip. For **meal deals** use the meal categories; for **any
bundle** use `pos = -1`; /sales/explore uses either.

**Never filter components on `trde_gross_value != 0`.** Components are €0,
so that filter drops them.

## Query Examples

### Top combos by revenue (last 30 days)

```sql
SELECT trde_combo_item AS combo_code,
       anyLastIf(item_name, trde_item = trde_combo_item) AS combo_name,
       sumIf(trde_qty, trde_item = trde_combo_item AND trde_sub_line = 0) AS combos_sold,
       -- header + components (+ paid extras added inside the combo)
       sum(trde_net_value) AS net_total
FROM transaction_details
WHERE brand = 'bk'
  AND trde_date >= today() - 30
  AND trde_void_time = ''
  AND trde_combo_item IN (
    SELECT trde_item FROM transaction_details
    WHERE brand = 'bk' AND trde_date >= today() - 30
      AND trde_combo_item_pos = -1)
GROUP BY trde_combo_item
ORDER BY net_total DESC
LIMIT 20
```

### Average components of one combo (what goes out with one combo)

```sql
WITH (
  SELECT sum(trde_qty) FROM transaction_details
  WHERE brand = 'bk' AND trde_date >= today() - 90 AND trde_void_time = ''
    AND trde_sub_line = 0 AND trde_item = '1517001'
    AND trde_combo_item = '1517001'
) AS combos
SELECT trde_item, anyLast(item_name) AS item_name,
       sum(trde_qty) AS qty, round(sum(trde_qty) / combos, 3) AS per_combo,
       sum(trde_net_value) AS paid_extra
FROM transaction_details
WHERE brand = 'bk'
  AND trde_date >= today() - 90
  AND trde_void_time = ''
  AND trde_combo_item = '1517001'
  AND trde_item != '1517001'
GROUP BY trde_item
ORDER BY qty DESC
```

`paid_extra` mixes paid add-ons/upgrades with the share of the combo price
some orders put on components; it is not "extras only".

### Meal-deal vs other revenue

```sql
-- A line is meal-deal revenue when it is a meal header or belongs to one
-- (components and their sub-lines point at the meal via trde_combo_item).
SELECT if(trde_combo_item IN (
            SELECT DISTINCT trde_item FROM transaction_details
            WHERE brand = 'bk' AND trde_date >= today() - 30
              AND item_category IN ('Combo Meals', 'Kids Meals',
                'Regular Buckets', 'Duo Buckets', 'Taco Bell Combos')),
          'Meal deal', 'Other') AS item_type,
       sum(trde_net_value) AS net_total
FROM transaction_details
WHERE brand = 'bk'
  AND trde_date >= today() - 30
  AND trde_void_time = ''
  AND trde_item != '-1'
GROUP BY item_type
ORDER BY net_total DESC
```

Combo revenue = header **plus** component lines (both queries above do
this): some orders split the combo price across components, so header-only
sums understate it.

## Deeper Analysis

For transaction-level context (channel, store, receipt method), JOIN to
`transactions` on `t.pk = td.transactionid` and combine with the patterns in
the `sales-channels` and `sales-sql` skills. Answer directly with SQL.
