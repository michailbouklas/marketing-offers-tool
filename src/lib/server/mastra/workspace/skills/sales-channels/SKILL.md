---
name: sales-channels
description: Analysing Novasero sales revenue by order channel (Dine In, Delivery, Drive Through), payment method, online vs in-store, and time-of-day distribution.
---

# Channel Revenue Analysis

## Key Fields (transactions)

- `dim_division_group_channel` — order channel. Common values: `'Dine In'`,
  `'Delivery'`, `'Drive Through'`, `'Take Away'`.
- `tran_online_factor` — 1 = online order, 0 = in-store.
- `cash_method_description` — human-readable payment method ('Cash', 'Card',
  'Voucher', …); `tran_cash_method` is the raw code (use the description for
  display).
- `receipt_method_description` — order type label.
- `receipt_category` / `receipt_category2` — further receipt classification.

## Examples

### Revenue by channel for a brand this month

```sql
SELECT dim_division_group_channel, sum(tran_net) AS revenue, count() AS txn_count
FROM transactions
WHERE brand = 'bk'
  AND toYear(tran_date) = toYear(today()) AND toMonth(tran_date) = toMonth(today())
GROUP BY dim_division_group_channel
ORDER BY revenue DESC
```

### Revenue by payment method for a brand this year

```sql
SELECT cash_method_description, sum(tran_net) AS revenue, count() AS txn_count
FROM transactions
WHERE brand = 'kfc'
  AND toYear(tran_date) = toYear(today())
GROUP BY cash_method_description
ORDER BY revenue DESC
```

### Online vs in-store revenue comparison

```sql
SELECT
  if(tran_online_factor = 1, 'Online', 'In-Store') AS channel,
  sum(tran_net) AS revenue, count() AS txn_count
FROM transactions
WHERE brand = 'kfc'
  AND toYear(tran_date) = toYear(today())
GROUP BY channel
ORDER BY revenue DESC
```

### Hourly sales distribution (Athens local time)

```sql
SELECT toHour(toTimeZone(trans_order_time, 'Europe/Athens')) AS hour_of_day,
       count() AS txn_count, sum(tran_net) AS revenue
FROM transactions
WHERE brand = 'wagamama'
  AND tran_date = today() - 1
GROUP BY hour_of_day
ORDER BY hour_of_day
```

### Items sold via a specific channel (JOIN)

```sql
SELECT td.trde_item, anyLast(td.item_name) AS item_name,
       sum(td.trde_gross_value) AS gross_total, sum(td.trde_qty) AS qty
FROM transactions AS t
INNER JOIN transaction_details AS td ON t.pk = td.transactionid
WHERE t.brand = 'bk'
  AND t.tran_date >= toDate('2026-01-01') AND td.trde_date >= toDate('2026-01-01')
  AND t.dim_division_group_channel = 'Delivery'
  AND td.trde_item != '-1'
  AND td.trde_gross_value != 0 AND td.trde_net_price != 0 AND td.trde_gross_price != 0
GROUP BY td.trde_item
ORDER BY gross_total DESC
LIMIT 20
```

### Revenue by store and mall

```sql
SELECT location_name, store_mall, sum(tran_net) AS revenue
FROM transactions
WHERE brand = 'phcy'
  AND toYear(tran_date) = toYear(today()) AND toMonth(tran_date) = toMonth(today())
GROUP BY location_name, store_mall
ORDER BY revenue DESC
```

## Notes

- For multi-brand channel performance, add `brand` to GROUP BY and SELECT.
- `store_trading_nature` (e.g. 'Restaurant', 'Kiosk') can further segment
  channel results.
- For cross-brand channel comparison, omit the brand filter and group by
  `brand, dim_division_group_channel`.
