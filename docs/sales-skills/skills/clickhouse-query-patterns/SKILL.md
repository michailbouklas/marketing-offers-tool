---
name: clickhouse-query-patterns
description: ClickHouse SQL query best practices, pre-flight count checks, error handling with retry logic, and vetted SQL examples for the Novasero sales data warehouse.
version: 1.0.0
tags:
  - clickhouse
  - sql
  - query
  - analytics
---

# ClickHouse Query Patterns

## Pre-Flight Count Check

Before running a data-retrieval query, you MUST run a count query first to determine
how many rows the final result would return. Skip this step ONLY when the user explicitly
asks for an aggregate (COUNT, SUM, AVG, MIN, MAX) — in that case, run the aggregate directly.

Steps:
  1) Build the user's intended query but wrap it as:
     `SELECT count() AS total_rows FROM (<intended_query_without_LIMIT>)`
     — OR equivalently, replace the SELECT columns with `count()` keeping the same
     FROM / WHERE / GROUP BY / HAVING clauses.
  2) Execute the count query. The result will be a SINGLE ROW with a `total_rows` value.
     READ THE VALUE of the `total_rows` field — do NOT look at how many rows the tool returned
     (which is always 1). The number you must evaluate is the VALUE inside that row.
  3) Apply these thresholds to the `total_rows` VALUE:
     - total_rows = 0  → Tell the user: "No data found for your request."
     - total_rows > 50000 → Tell the user: "The query would return {total_rows} rows,
       which is too large to display. Please add more filters (date range, brand, location, etc.)
       to narrow down the results."
     - total_rows > 500 → Run the actual query WITH `LIMIT 200` and tell the user:
       "Showing first 200 of {total_rows} rows. You can export the full dataset as CSV."
     - total_rows <= 500 → Run the actual query without a LIMIT (or LIMIT 500) and show all rows.

## Error Handling & Retry

When the query-database tool returns `success: false`, do NOT report the raw error to the user.
Instead, follow these steps:
  1) Read the `error` field carefully. Common ClickHouse errors include:
     - ILLEGAL_AGGREGATION: Nested aggregate functions (e.g. `any(x)` inside `studentTTest()`).
       Fix: use a subquery or CTE to pre-compute the inner aggregation, then apply the outer one.
     - UNKNOWN_FUNCTION: ClickHouse does not have that function. Find the correct ClickHouse equivalent.
     - SYNTAX_ERROR: Malformed SQL. Review and fix the syntax.
     - TYPE_MISMATCH: Wrong column types in comparison or arithmetic. Cast with appropriate functions.
     - THERE_IS_NO_COLUMN: Column name is wrong. Check the schema and correct it.
  2) Rewrite the query to fix the error.
  3) Retry the corrected query by calling query-database again.
  4) You may retry up to 3 times. If all 3 retries fail, THEN tell the user:
     "I was unable to run this query after several attempts. The error was: {error}.
      Please try rephrasing your question or simplifying the request."
  5) NEVER show raw ClickHouse error stack traces to the user.

Common fix patterns:
  - Nested aggregates → break into CTEs:
    BAD:  `SELECT studentTTest(any(x), any(y)) FROM t`
    GOOD: `WITH pre AS (SELECT any(x) AS x_val, any(y) AS y_val FROM t)
           SELECT studentTTest(x_val, y_val) FROM pre`
  - String vs number comparison → use `toString()` or `toInt32()` casts.
  - Date vs DateTime mismatch → use `toDate()` or `toDateTime()`.

## SQL Rules (ClickHouse)

- GROUP BY: include all non-aggregated SELECT columns.
- Date filtering:
  - Dates are Date type; use toDate('YYYY-MM-DD') for literals.
  - Current year: `toYear(tran_date) = toYear(today())` (or use trde_date for details).
  - Ranges: `tran_date BETWEEN toDate('2025-01-01') AND toDate('2025-09-19')`.
  - Month queries without year: Assume current year, e.g., for August: `toYear(tran_date) = toYear(today()) AND toMonth(tran_date) = 8`.
- Timezone: When you need local time for DateTime columns, convert with
  `toTimeZone(trans_order_time, 'Europe/Athens')`.
- Partition pruning: Both tables are partitioned by toYYYYMM on their date column.
  ALWAYS include a date filter so ClickHouse can skip irrelevant partitions.
  In JOINs filter both t.tran_date and td.trde_date.
- DISTINCT aggregates: Only use DISTINCT if duplicates can be introduced by a JOIN.
  For plain aggregations on a single table, do NOT add DISTINCT.
- anyLast() / any(): Use `anyLast(column)` to pick a representative value for a non-aggregated
  descriptive column when it is functionally dependent on the GROUP BY key.
- Decimal handling: ClickHouse Decimal types are exact. Use toDecimal64(value, scale) if you need
  to cast literal numbers in arithmetic. Aggregates like sum() preserve Decimal type automatically.
- ALWAYS exclude items with 0 price: Add `AND trde_gross_value != 0 AND trde_net_price != 0 AND trde_gross_price != 0` to queries on transaction_details.
- ALWAYS exclude items with trde_item '-1': Add `AND trde_item != '-1'` to queries on transaction_details.
- In ORDER BY expressions, you can reference aliases defined in SELECT.

## Table Relationship & JOIN Pattern

transactions.pk = transaction_details.transactionid  (one-to-many)

JOIN pattern (always use INNER or LEFT JOIN with explicit ON):
  `FROM transactions AS t
   INNER JOIN transaction_details AS td ON t.pk = td.transactionid`

When joining, push date filters on BOTH sides for partition pruning:
  `WHERE t.tran_date >= toDate('2025-01-01')
    AND td.trde_date >= toDate('2025-01-01')`

## Field Mapping and Metrics

- Revenue/gross:
  - Transaction level: use tran_net from transactions (NOT tran_gross for revenue).
  - Item level: use trde_gross_value from transaction_details.
- Quantity: use trde_qty on details.
- Item identifier: trde_item. Item descriptors: item_name, item_category, item_subcategory, item_short_description.
- Location: use tran_location (or trde_location) to filter, but return location_name field.
- Division: use tran_division (or trde_division) to filter, but return division_name field.
- Division grouping: use dim_division_group_channel for channel analysis (e.g. 'Dine In', 'Delivery', 'Drive Through').
- Date fields: use tran_date for transactions, trde_date for transaction_details.
- Time fields: trans_order_time (DateTime) for order time. Always convert with toTimeZone(..., 'Europe/Athens').
- Returns: tran_sales_factor = -1 indicates a return/refund.
- Voided items: trde_void_time != '' on transaction_details.
- Online orders: tran_online_factor = 1 on transactions.

## SQL Examples

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
  AND t.tran_date >= toDate('2025-01-01') AND td.trde_date >= toDate('2025-01-01')
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
