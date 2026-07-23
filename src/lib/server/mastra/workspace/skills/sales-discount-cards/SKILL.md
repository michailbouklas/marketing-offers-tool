---
name: sales-discount-cards
description: Query patterns and field mappings for analysing discount card usage, identifying top cardholders, flagging suspicious activity, and understanding discount impact in the Novasero sales data.
---

# Discount Card Analysis

## Key Fields

On `transactions`:

- `tran_discount_cust` (String) — the discount card identifier used ('' = none)
- `tran_discount` (Decimal) — total discount amount applied via the card
- `tran_manual_disc_perc` / `tran_manual_disc_amount` (Decimal) — manual discounts
- `tran_prepaid_card` / `tran_barter_card` (String) — card numbers

On `transaction_details`:

- `trde_discount` / `trde_line_discount` (Decimal) — line-level discounts
- `trde_coupon` (String) — coupon code used; `trde_is_coupon` (Int32) — 1 =
  coupon redemption line; `trde_coupon_group` (Int32) — coupon family id
- `trde_loyalty_points` (Int32) — loyalty points earned/redeemed
- `trde_prepaid_card` / `trde_prepaid_amount` — prepaid charges

## Query Examples

### Top 10 discount cards by total discount this year

```sql
SELECT tran_discount_cust, sum(tran_discount) AS total_discount, count() AS txn_count
FROM transactions
WHERE brand = 'nero'
  AND toYear(tran_date) = toYear(today())
  AND tran_discount_cust != ''
GROUP BY tran_discount_cust
ORDER BY total_discount DESC
LIMIT 10
```

### Cards with high transaction frequency (potential flagging)

```sql
SELECT tran_discount_cust, count() AS txn_count, sum(tran_discount) AS total_discount,
       min(tran_date) AS first_use, max(tran_date) AS last_use
FROM transactions
WHERE tran_discount_cust != ''
  AND tran_date >= today() - 30
GROUP BY tran_discount_cust
HAVING txn_count > 10
ORDER BY txn_count DESC
LIMIT 50
```

### Discount card usage across all brands

```sql
SELECT brand, tran_discount_cust, count() AS txn_count, sum(tran_discount) AS total_discount
FROM transactions
WHERE tran_discount_cust != ''
  AND toYear(tran_date) = toYear(today())
GROUP BY brand, tran_discount_cust
ORDER BY txn_count DESC
LIMIT 100
```

### Average discount per transaction by brand

```sql
SELECT brand,
       avg(tran_discount) AS avg_discount,
       sum(tran_discount) AS total_discount,
       count() AS txn_with_discount
FROM transactions
WHERE tran_discount > 0
  AND toYear(tran_date) = toYear(today())
GROUP BY brand
ORDER BY avg_discount DESC
```

### Coupon redemption summary

```sql
SELECT trde_coupon, count() AS redemption_count, sum(trde_discount) AS total_discount
FROM transaction_details
WHERE brand = 'bk'
  AND trde_is_coupon = 1
  AND trde_date >= today() - 30
  AND trde_item != '-1'
GROUP BY trde_coupon
ORDER BY redemption_count DESC
LIMIT 20
```

## Flagging Pattern

For suspicious-activity flagging across all brands, use a threshold query
over a configurable window: group by `tran_discount_cust` (and optionally
`brand` / `tran_location`), compute txn_count, total_discount, distinct
locations, and first/last use, then flag cards exceeding the thresholds —
see the "high transaction frequency" example above and extend it, e.g.
`uniqExact(tran_location) AS locations_used` to catch the same card used at
many stores.

## Notes

- Always filter `tran_discount_cust != ''` to exclude card-less transactions.
- Manual discounts (`tran_manual_disc_perc`, `tran_manual_disc_amount`) are
  separate from card discounts — query both when investigating total
  discounting.
- Suspicious patterns: same card at multiple locations, very high txn_count
  in short windows, unusually high total_discount.
