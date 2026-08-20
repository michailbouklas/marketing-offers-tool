---
name: combo-item-analysis
description: Query patterns for analysing combo meals and meal deals in the Novasero sales data, including child items, master items, bundle performance, and combo revenue breakdown.
version: 1.0.0
tags:
  - combo
  - meal-deal
  - items
  - bundle
  - analytics
---

# Combo Item Analysis

## Key Fields (transaction_details)

- `trde_combo_item` (String) — the parent combo item code that this line belongs to. Empty string if not part of a combo.
- `trde_combo_item_group` (Int16) — combo group index (position within the combo structure)
- `trde_combo_item_pos` (Int16) — position within the combo group
- `trde_is_master_item` (Int32) — `1` = this line is the master/parent item of the combo; `0` = child/modifier item
- `trde_item` (String) — individual item code
- `item_name` (String) — human-readable item name

## Relationship

- A combo transaction generates multiple `transaction_details` rows:
  - One row with `trde_is_master_item = 1` (the combo itself)
  - One or more rows with `trde_combo_item = <parent_code>` (the components)
- To analyse the combo as a whole, aggregate by `trde_combo_item`
- To analyse individual components, filter by `trde_combo_item != ''`

## Query Examples

### Top combo meals by revenue (last 30 days)

```sql
SELECT trde_combo_item, anyLast(item_name) AS combo_name,
       count() AS items_sold, sum(trde_gross_value) AS gross_total
FROM transaction_details
WHERE brand = 'bk'
  AND trde_date >= today() - 30
  AND trde_combo_item != ''
  AND trde_item != '-1'
  AND trde_gross_value != 0 AND trde_net_price != 0 AND trde_gross_price != 0
GROUP BY trde_combo_item
ORDER BY gross_total DESC
LIMIT 10
```

### Master combo items sold (combo-level aggregation)

```sql
SELECT trde_item, anyLast(item_name) AS item_name,
       sum(trde_qty) AS qty_sold, sum(trde_gross_value) AS gross_total
FROM transaction_details
WHERE brand = 'bk'
  AND trde_date >= today() - 30
  AND trde_is_master_item = 1
  AND trde_item != '-1'
  AND trde_gross_value != 0 AND trde_net_price != 0 AND trde_gross_price != 0
GROUP BY trde_item
ORDER BY qty_sold DESC
LIMIT 20
```

### Component breakdown for a specific combo

```sql
SELECT trde_item, anyLast(item_name) AS item_name,
       sum(trde_qty) AS qty, sum(trde_gross_value) AS gross_total
FROM transaction_details
WHERE brand = 'bk'
  AND trde_date >= today() - 30
  AND trde_combo_item = 'COMBO_CODE_HERE'
  AND trde_item != '-1'
GROUP BY trde_item
ORDER BY qty DESC
```

### Combo vs standalone item revenue

```sql
SELECT
  if(trde_combo_item != '', 'Combo Component', 'Standalone') AS item_type,
  sum(trde_gross_value) AS gross_total,
  sum(trde_qty) AS qty_total,
  count() AS line_count
FROM transaction_details
WHERE brand = 'bk'
  AND toYear(trde_date) = toYear(today())
  AND trde_item != '-1'
  AND trde_gross_value != 0 AND trde_net_price != 0 AND trde_gross_price != 0
GROUP BY item_type
ORDER BY gross_total DESC
```

## Delegation

For deeper combo analysis combining transaction-level context, store performance, and narrative reporting,
delegate to the `agent-comboItemsAgent` subagent. It is specialised in meal-deal analytics and can
combine combo data with broader sales context.
