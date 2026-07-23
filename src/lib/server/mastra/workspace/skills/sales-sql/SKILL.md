---
name: sales-sql
description: Full schema reference, SQL rules, pre-flight count checks, error-retry patterns, and vetted ClickHouse query examples for the Novasero POS sales tables (transactions, transaction_details).
---

# Sales SQL

ClickHouse database holding the Novasero POS data for every PHC brand. Use
unqualified table names — the tool's connection already selects the sales
database. Both tables are plain `MergeTree` partitioned by `toYYYYMM` on
their date column: **ALWAYS include a date filter** so ClickHouse can skip
irrelevant partitions. In JOINs filter both `t.tran_date` and `td.trde_date`.

## Tables

### transactions — one row per order/receipt

Primary key `pk` (String). Join to details via
`transactions.pk = transaction_details.transactionid` (one-to-many).

| Column                                                                                                                        | Type                   | Notes                                                    |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------- |
| pk                                                                                                                            | String                 | Primary key                                              |
| tran_date                                                                                                                     | Date                   | Partition/order key — always filter                      |
| tran_location                                                                                                                 | Int16                  | Location id — filter on this, display location_name      |
| tran_division                                                                                                                 | Int32                  | Division id — filter on this, display division_name      |
| tran_no                                                                                                                       | Int32                  | Transaction number                                       |
| tran_gross                                                                                                                    | Decimal(15,4)          | Gross amount                                             |
| tran_discount                                                                                                                 | Decimal(15,4)          | Captured discount (net)                                  |
| tran_net                                                                                                                      | Decimal(15,4)          | **Revenue standard** — net of VAT/service                |
| tran_vat                                                                                                                      | Decimal(15,4)          | VAT                                                      |
| tran_cto / tran_cover / tran_del_charge / tran_service                                                                        | Decimal(15,4)          | Charges                                                  |
| tran_total                                                                                                                    | Decimal(15,4)          | Total                                                    |
| tran_receipt                                                                                                                  | String                 | Receipt id                                               |
| tran_employee / tran_cashin_employee                                                                                          | String                 | Employee ids                                             |
| trans_order_time / trans_cashin_time                                                                                          | DateTime               | Convert with toTimeZone(..., 'Europe/Athens')            |
| tran_cashed_in / tran_driver_cashed_in                                                                                        | Bool                   |                                                          |
| tran_customer / tran_cust_no / tran_sales_customer                                                                            | String / Int32 / Int32 | Customer refs                                            |
| tran_cash_method                                                                                                              | String                 | Payment code — display cash_method_description           |
| tran_discount_cust                                                                                                            | String                 | Discount card id ('' = none)                             |
| tran_prepaid_card / tran_barter_card                                                                                          | String                 | Card numbers                                             |
| tran_manual_disc_perc / tran_manual_disc_amount                                                                               | Decimal(15,2)          | Manual discounts                                         |
| tran_sales_factor                                                                                                             | Int16                  | **-1 = return/refund; use = 1 for sales**                |
| tran_stock_factor / tran_staff_factor / tran_comp_factor / tran_non_prepaid_factor / tran_credit_factor / tran_invoice_factor | Int16                  | Flags                                                    |
| tran_online_factor                                                                                                            | Int16                  | **1 = online order**                                     |
| tran_receipt_series / tran_receipt_series_number                                                                              | String / Int32         | Receipt series                                           |
| tran_cancel_series / tran_cancel_series_number                                                                                | String / Int32         | Cancellation series                                      |
| division_name                                                                                                                 | String                 | Division description                                     |
| dim_division_group_source                                                                                                     | String                 | 'Own' vs 'External'                                      |
| dim_division_group_channel                                                                                                    | String                 | e.g. 'Dine In', 'Delivery', 'Drive Through', 'Take Away' |
| dim_division_group_name                                                                                                       | String                 | Generic division grouping                                |
| receipt_method_description                                                                                                    | String                 | Order type label                                         |
| receipt_category / receipt_category2                                                                                          | String                 | Receipt classification                                   |
| cash_method_description                                                                                                       | String                 | Human-readable payment method                            |
| brand                                                                                                                         | String                 | Lowercase brand code (see sales-brand-mapping)           |
| location_name                                                                                                                 | String                 | Store display name                                       |
| store_brand / store_mall / store_country / store_company / store_bi_name / store_trading_nature                               | String                 | Store descriptors                                        |

### transaction_details — one row per item line (includes voided lines)

| Column                                           | Type                   | Notes                                              |
| ------------------------------------------------ | ---------------------- | -------------------------------------------------- |
| pk                                               | String                 | Row key                                            |
| transactionid                                    | String                 | → transactions.pk                                  |
| trde_date                                        | Date                   | Partition/order key — always filter                |
| trde_location / trde_division / trde_no          | Int16 / Int32 / Int32  | Mirror of transaction keys                         |
| trde_line / trde_sub_line                        | Int16                  | Line structure                                     |
| trde_item                                        | String                 | Item code — **exclude '-1'**                       |
| trde_gross_price / trde_net_price                | Decimal(15,8)          | Unit prices                                        |
| trde_discount / trde_line_discount               | Decimal                | Line discounts                                     |
| trde_vat / trde_cto / trde_service (+ \_value)   | Decimal                | Charges                                            |
| trde_net_value / trde_gross_value                | Decimal(15,8)          | Line revenue (net / gross)                         |
| trde_qty                                         | Int32                  | Quantity                                           |
| trde_qty_ratio                                   | Decimal(15,4)          | Multiply trde_qty \* trde_qty_ratio for true units |
| trde_size                                        | String                 | e.g. pizza size (see sales-pizza-hut)              |
| trde_type                                        | String                 | e.g. pizza dough type                              |
| trde_promo_perc                                  | Decimal(15,2)          | Promo percentage                                   |
| trde_normal_price                                | Decimal(15,4)          | Standard price before adjustments                  |
| trde_coupon / trde_coupon_group / trde_is_coupon | String / Int32 / Int32 | Coupon fields (see sales-coupons)                  |
| trde_combo_item                                  | String                 | Parent offer/combo reference ('' = none)           |
| trde_combo_item_group / trde_combo_item_pos      | Int16                  | Combo structure (-999 = unused)                    |
| trde_is_master_item                              | Int32                  | 1 = combo master row                               |
| trde_void_time                                   | String                 | **'' = not voided**                                |
| trde_void_series / trde_void_series_number       | String / Int32         | **0 = valid line (counts in sales)**               |
| trde_loyalty_points                              | Int32                  | Loyalty points                                     |
| trde_prepaid_card / trde_prepaid_amount          | String / Decimal(15,2) | Prepaid                                            |
| trde_employee                                    | String                 | Employee                                           |
| trde_recorded_time / trde_released_time          | String                 | Timestamps (String!)                               |
| trde_cooking_start_time                          | DateTime               |                                                    |
| item_name                                        | String                 | Display name                                       |
| item_category / item_subcategory                 | String                 | Categorisation                                     |
| item_short_description                           | String                 | Short description                                  |
| brand                                            | String                 | Lowercase brand code                               |

## Table Relationship & JOIN Pattern

`transactions.pk = transaction_details.transactionid` (one-to-many).

```sql
FROM transactions AS t
INNER JOIN transaction_details AS td ON t.pk = td.transactionid
WHERE t.tran_date >= toDate('2026-01-01')
  AND td.trde_date >= toDate('2026-01-01')
```

Push date filters on BOTH sides for partition pruning.

## Field Mapping and Metrics

- Revenue/sales: **net amount** is the company standard — `tran_net` at
  transaction level (NOT tran_gross), `trde_net_value` (or `trde_gross_value`
  when gross is explicitly asked) at item level.
- Quantity: `trde_qty` (× `trde_qty_ratio` for true units where relevant).
- Item identifier: `trde_item`; descriptors: item_name, item_category,
  item_subcategory, item_short_description.
- Location/division: filter by tran_location / tran_division, display
  location_name / division_name.
- Channel analysis: `dim_division_group_channel` ('Dine In', 'Delivery',
  'Drive Through', …); 'Own' vs 'External' in `dim_division_group_source`.
- Time of day: `toHour(toTimeZone(trans_order_time, 'Europe/Athens'))`.
- Returns/refunds: `tran_sales_factor = -1`; sales-focused queries typically
  filter `tran_sales_factor = 1`.
- Voided items: `trde_void_time != ''` (voided) / `trde_void_series_number = 0`
  (valid). To reconcile detail revenue with transaction revenue, exclude
  voided lines.
- Online orders: `tran_online_factor = 1`.

## SQL Rules (ClickHouse)

- GROUP BY: include all non-aggregated SELECT columns; `anyLast(column)` picks
  a representative value for a descriptive column functionally dependent on
  the GROUP BY key.
- Dates are Date type: `toDate('YYYY-MM-DD')` literals;
  `toYear(tran_date) = toYear(today())` for the current year; month without a
  year means the current year.
- **ALWAYS exclude items with 0 price on transaction_details**:
  `AND trde_gross_value != 0 AND trde_net_price != 0 AND trde_gross_price != 0`
  — EXCEPT for offer/coupon analysis (the sales-offers skill overrides this).
- **ALWAYS exclude `trde_item != '-1'`** on transaction_details.
- DISTINCT only when a JOIN can introduce duplicates — never for plain
  single-table aggregations.
- Decimals are exact; `sum()` preserves Decimal. Cast literals with
  `toDecimal64(value, scale)` when needed.
- ORDER BY may reference SELECT aliases.
- For any MTD/YTD/QTD/WTD or "to date" comparison, load the
  `sales-to-date-rules` skill — anchor cutoffs to max(tran_date), never the
  calendar clock.

## Pre-Flight Count Check

Before running a data-retrieval query, run a count first to see how many rows
the result would be. Skip ONLY when the user explicitly asks for an aggregate
(COUNT/SUM/AVG/MIN/MAX) — run the aggregate directly then.

1. Wrap the intended query: `SELECT count() AS total_rows FROM (<intended_query_without_LIMIT>)`.
2. Read the VALUE of `total_rows` (the tool always returns 1 row here — the
   number you evaluate is inside that row).
3. Thresholds:
   - `= 0` → "No data found for your request."
   - `> 50000` → too large; ask the user to narrow with filters (date range, brand, location…).
   - `> 500` → run with `LIMIT 200` and say "Showing first 200 of {total_rows} rows. You can export the full dataset as Excel."
   - `<= 500` → run without LIMIT (or LIMIT 500) and show all rows.

## Error Handling & Retry

When the tool returns `ok: false`, do NOT surface the raw error. Read the
`error` field, fix, and retry (up to 3 times):

- ILLEGAL_AGGREGATION (nested aggregates) → pre-compute the inner aggregate
  in a CTE/subquery:
  BAD: `SELECT studentTTest(any(x), any(y)) FROM t`
  GOOD: `WITH pre AS (SELECT any(x) AS x, any(y) AS y FROM t) SELECT studentTTest(x, y) FROM pre`
- UNKNOWN_FUNCTION → find the ClickHouse equivalent.
- TYPE_MISMATCH → cast with toString() / toInt32() / toDate() / toDateTime().
- THERE_IS_NO_COLUMN → re-check the schema above and correct the name.

After 3 failed retries, tell the user you could not run the query and suggest
rephrasing — never show a stack trace.

## Vetted Examples

### 1. Total revenue for KFC this year

```sql
SELECT sum(tran_net) AS total_revenue
FROM transactions
WHERE brand = 'kfc'
  AND toYear(tran_date) = toYear(today())
```

### 2. Best performing brand in August (current year)

```sql
SELECT brand, sum(tran_net) AS total_revenue
FROM transactions
WHERE toYear(tran_date) = toYear(today()) AND toMonth(tran_date) = 8
GROUP BY brand
ORDER BY total_revenue DESC
LIMIT 1
```

### 3. Top 10 items by net value last 7 days for BK

```sql
SELECT trde_item, anyLast(item_name) AS item_name, sum(trde_net_value) AS net_total
FROM transaction_details
WHERE brand = 'bk'
  AND trde_date >= today() - 7
  AND trde_item != '-1'
  AND trde_gross_value != 0 AND trde_net_price != 0 AND trde_gross_price != 0
GROUP BY trde_item
ORDER BY net_total DESC
LIMIT 10
```

### 4. Top selling item per brand (current year) — window function

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

### 5. JOIN — items sold via delivery

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

### 6. Hourly sales distribution (Athens local time)

```sql
SELECT toHour(toTimeZone(trans_order_time, 'Europe/Athens')) AS hour_of_day,
       count() AS txn_count, sum(tran_net) AS revenue
FROM transactions
WHERE brand = 'wagamama'
  AND tran_date = today() - 1
GROUP BY hour_of_day
ORDER BY hour_of_day
```

### 7. Average transaction value by store

```sql
SELECT location_name, avg(tran_net) AS avg_ticket, count() AS txn_count
FROM transactions
WHERE brand = 'paul'
  AND toYear(tran_date) = toYear(today())
GROUP BY location_name
ORDER BY avg_ticket DESC
```

### 8. Voided items analysis

```sql
SELECT trde_item, anyLast(item_name) AS item_name, count() AS void_count
FROM transaction_details
WHERE brand = 'bk'
  AND trde_date >= today() - 30
  AND trde_void_time != ''
  AND trde_item != '-1'
GROUP BY trde_item
ORDER BY void_count DESC
LIMIT 10
```

### 9. Item category breakdown by revenue

```sql
SELECT item_category, item_subcategory,
       sum(trde_gross_value) AS gross_total, sum(trde_qty) AS qty_total
FROM transaction_details
WHERE brand = 'wagamama'
  AND toYear(trde_date) = toYear(today())
  AND trde_item != '-1'
  AND trde_gross_value != 0 AND trde_net_price != 0 AND trde_gross_price != 0
GROUP BY item_category, item_subcategory
ORDER BY gross_total DESC
```

### 10. Revenue by store location and mall

```sql
SELECT location_name, store_mall, sum(tran_net) AS revenue
FROM transactions
WHERE brand = 'phcy'
  AND toYear(tran_date) = toYear(today()) AND toMonth(tran_date) = toMonth(today())
GROUP BY location_name, store_mall
ORDER BY revenue DESC
```
