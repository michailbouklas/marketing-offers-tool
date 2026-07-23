---
name: discount-card-analysis
description: Query patterns and field mappings for analysing discount card usage, identifying top cardholders, flagging suspicious activity, and understanding discount impact in the Novasero sales data.
version: 1.0.0
tags:
  - discount
  - loyalty
  - cards
  - fraud
  - analysis
---

# Discount Card Analysis

## Key Fields

On `transactions`:
- `tran_discount_cust` (String) — the discount card identifier used on this transaction
- `tran_discount` (Decimal) — total discount amount applied via the card
- `tran_manual_disc_perc` (Decimal) — manual discount percentage applied
- `tran_manual_disc_amount` (Decimal) — manual discount amount applied
- `tran_prepaid_card` (String) — prepaid card number
- `tran_barter_card` (String) — barter card number

On `transaction_details`:
- `trde_discount` (Decimal) — discount amount on this individual line item
- `trde_line_discount` (Decimal) — line-level discount
- `trde_coupon` (String) — coupon code used
- `trde_is_coupon` (Int32) — 1 = this line is a coupon redemption
- `trde_coupon_group` (Int32) — coupon group id for aggregating coupon families
- `trde_loyalty_points` (Int32) — loyalty points earned or redeemed
- `trde_prepaid_card` (String) — prepaid card linked to this line
- `trde_prepaid_amount` (Decimal) — amount charged to prepaid on this line

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

## Flagging Workflow

For automated discount card flagging across all brands (threshold-based, configurable time window),
trigger the `workflow-discountCardFlaggingWorkflow` tool rather than writing manual SQL.
This workflow handles multi-brand scanning and structured flag output automatically.

## Notes

- Always filter `tran_discount_cust != ''` to exclude transactions without a card.
- Manual discounts (`tran_manual_disc_perc`, `tran_manual_disc_amount`) are separate from card discounts — query both if investigating total discounting.
- Suspicious patterns: same card used at multiple locations, very high txn_count in short windows, or unusually high total_discount values.
