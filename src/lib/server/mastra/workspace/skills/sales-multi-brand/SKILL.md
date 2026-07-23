---
name: sales-multi-brand
description: Patterns for comparing performance across multiple Novasero restaurant brands — revenue, item sales, channel mix, and store metrics — using the single-source ClickHouse model.
---

# Multi-Brand Comparison

## Single-Source Model

All brands share the same `transactions` and `transaction_details` tables —
no UNION queries. Use `brand` as a filter or GROUP BY dimension:

- Subset: `WHERE brand IN ('bk', 'kfc', 'phcy')`
- All brands: omit the brand filter and `GROUP BY brand`

## Revenue Comparison Examples

### Revenue by brand — current year

```sql
SELECT brand, sum(tran_net) AS total_revenue, count() AS txn_count,
       avg(tran_net) AS avg_ticket
FROM transactions
WHERE toYear(tran_date) = toYear(today())
GROUP BY brand
ORDER BY total_revenue DESC
```

### Revenue by brand — specific month

```sql
SELECT brand, sum(tran_net) AS total_revenue, count() AS txn_count
FROM transactions
WHERE toYear(tran_date) = toYear(today()) AND toMonth(tran_date) = 1
GROUP BY brand
ORDER BY total_revenue DESC
```

### Month-over-month brand comparison (current vs previous month)

```sql
SELECT brand,
  sumIf(tran_net, toMonth(tran_date) = toMonth(today())) AS current_month,
  sumIf(tran_net, toMonth(tran_date) = toMonth(today()) - 1) AS previous_month
FROM transactions
WHERE toYear(tran_date) = toYear(today())
  AND toMonth(tran_date) IN (toMonth(today()), toMonth(today()) - 1)
GROUP BY brand
ORDER BY current_month DESC
```

### Brand performance by channel

```sql
SELECT brand, dim_division_group_channel,
       sum(tran_net) AS revenue, count() AS txn_count
FROM transactions
WHERE toYear(tran_date) = toYear(today())
GROUP BY brand, dim_division_group_channel
ORDER BY brand, revenue DESC
```

### Top item per brand (this year)

```sql
WITH item_sales AS (
  SELECT brand, trde_item, anyLast(item_name) AS item_name,
         sum(trde_gross_value) AS total_gross
  FROM transaction_details
  WHERE toYear(trde_date) = toYear(today())
    AND trde_item != '-1'
    AND trde_gross_value != 0 AND trde_net_price != 0 AND trde_gross_price != 0
  GROUP BY brand, trde_item
)
SELECT brand, trde_item, item_name, total_gross
FROM (
  SELECT brand, trde_item, item_name, total_gross,
         row_number() OVER (PARTITION BY brand ORDER BY total_gross DESC) AS rn
  FROM item_sales
)
WHERE rn = 1
ORDER BY total_gross DESC
```

## Deeper Head-to-Head Comparison

For a narrative head-to-head brand comparison (revenue + channel mix + top
items + store-level breakdown), run the queries above for the requested
brands and date range and synthesize the results — combine with the
`sales-combo-items` and `sales-channels` skills as needed.

## Notes

- With many rows, group the output table by brand for readability.
- Use `store_bi_name` for more meaningful store labels in cross-brand
  location reports.
- `store_company` identifies the legal entity — useful for ownership grouping
  (see the `sales-business-overview` skill).
- When comparing across years, anchor both periods to the same calendar range
  to avoid partial-month skew — for to-date comparisons load the
  `sales-to-date-rules` skill.
