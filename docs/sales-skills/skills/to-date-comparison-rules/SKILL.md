---
name: to-date-comparison-rules
description: Rules and ClickHouse SQL patterns for MTD, YTD, QTD, WTD, and YoY-to-date analysis using the latest available warehouse date so comparisons use equivalent date ranges.
---

# to-date-comparison-rules

## Purpose
Use this skill for any query involving:
- MTD / month-to-date
- YTD / year-to-date
- QTD / quarter-to-date
- WTD / week-to-date
- period-to-date
- YoY to-date comparisons
- current period vs prior period where the current period is incomplete
- “today”, “current month”, “current year”, or similar dynamic date logic

This skill ensures the agent compares equivalent date ranges when the warehouse data is not current to the calendar date.

## Core business rule
- The warehouse is typically 1 day behind the calendar date.
- Therefore, do **not** assume data exists through the current calendar date.
- For to-date analysis, **always use the latest available warehouse date as the cutoff date**.
- Prior-period comparisons must use the **equivalent relative cutoff date**.
- Never compare a partial current period to a longer prior period.

## Default cutoff logic
- Preferred approach: determine the latest available date from the relevant table and use it as the cutoff date.
- Fallback approach: if a dynamic max-date check is not practical, use `today() - 1`.
- Use:
  - `max(tran_date)` for transaction-level queries
  - `max(trde_date)` for item-level queries
- If joining tables, use cutoff logic appropriate to the grain of the analysis and ensure both tables are filtered consistently.

## Interpretation rules
Unless the user explicitly provides fixed dates, interpret:
- “today” as the latest available warehouse date
- “current MTD” as month start through latest available warehouse date
- “current YTD” as year start through latest available warehouse date
- “current QTD” as quarter start through latest available warehouse date
- “current WTD” as week start through latest available warehouse date

If the user gives explicit calendar dates, use those exact dates instead of automatic to-date logic.

## Comparison rules
### YoY to-date
- current period end = latest available date
- prior-year period end = same relative date one year earlier

### Prior-period comparisons
- Compare equal-length windows only.
- If the current period is incomplete, truncate the comparison period to the same relative cutoff.

### Never do this
- current YTD through March 5 vs prior YTD through March 6
- current MTD through March 5 vs full March last year
- current WTD through Tuesday vs prior week through Sunday

## Date range examples
If latest available date = `2026-03-05`:
- YTD current = `2026-01-01` to `2026-03-05`
- YTD prior year = `2025-01-01` to `2025-03-05`
- MTD current = `2026-03-01` to `2026-03-05`
- MTD prior year = `2025-03-01` to `2025-03-05`
- QTD current = `2026-01-01` to `2026-03-05`
- QTD prior year = `2025-01-01` to `2025-03-05`
- WTD current = start of current reporting week to `2026-03-05`
- WTD prior year or prior week = equivalent weekday cutoff only

## ClickHouse date patterns
Use ClickHouse date functions only.

Useful functions:
- `today()`
- `addDays(date, n)`
- `addYears(date, n)`
- `toStartOfMonth(date)`
- `toStartOfQuarter(date)`
- `toStartOfYear(date)`
- `toStartOfWeek(date)`
- `toDate(...)`

## Recommended pattern: transaction-level cutoff

```sql
WITH cutoff AS (
    SELECT max(tran_date) AS max_date
    FROM transactions
    WHERE tran_date <= today()
)
SELECT
    max_date,
    toStartOfYear(max_date) AS current_ytd_start,
    addYears(toStartOfYear(max_date), -1) AS prior_ytd_start,
    addYears(max_date, -1) AS prior_ytd_end
FROM cutoff
```

## Recommended pattern: item-level cutoff

```sql
WITH cutoff AS (
    SELECT max(trde_date) AS max_date
    FROM transaction_details
    WHERE trde_date <= today()
      AND trde_item != '-1'
      AND trde_net_price != 0
      AND trde_void_time = ''
)
SELECT
    max_date,
    toStartOfMonth(max_date) AS current_mtd_start,
    addYears(toStartOfMonth(max_date), -1) AS prior_mtd_start,
    addYears(max_date, -1) AS prior_mtd_end
FROM cutoff
```

## YTD YoY template — transactions

```sql
WITH cutoff AS (
    SELECT max(tran_date) AS max_date
    FROM transactions
    WHERE tran_date <= today()
),
ranges AS (
    SELECT
        max_date,
        toStartOfYear(max_date) AS current_start,
        max_date AS current_end,
        addYears(toStartOfYear(max_date), -1) AS prior_start,
        addYears(max_date, -1) AS prior_end
    FROM cutoff
)
SELECT
    'current_ytd' AS period,
    count() AS orders,
    sum(t.tran_net) AS revenue
FROM transactions AS t
CROSS JOIN ranges AS r
WHERE t.tran_date BETWEEN r.current_start AND r.current_end
  AND t.tran_sales_factor = 1

UNION ALL

SELECT
    'prior_ytd' AS period,
    count() AS orders,
    sum(t.tran_net) AS revenue
FROM transactions AS t
CROSS JOIN ranges AS r
WHERE t.tran_date BETWEEN r.prior_start AND r.prior_end
  AND t.tran_sales_factor = 1
```

## MTD YoY template — transactions

```sql
WITH cutoff AS (
    SELECT max(tran_date) AS max_date
    FROM transactions
    WHERE tran_date <= today()
),
ranges AS (
    SELECT
        max_date,
        toStartOfMonth(max_date) AS current_start,
        max_date AS current_end,
        addYears(toStartOfMonth(max_date), -1) AS prior_start,
        addYears(max_date, -1) AS prior_end
    FROM cutoff
)
SELECT
    'current_mtd' AS period,
    count() AS orders,
    sum(t.tran_net) AS revenue
FROM transactions AS t
CROSS JOIN ranges AS r
WHERE t.tran_date BETWEEN r.current_start AND r.current_end
  AND t.tran_sales_factor = 1

UNION ALL

SELECT
    'prior_mtd' AS period,
    count() AS orders,
    sum(t.tran_net) AS revenue
FROM transactions AS t
CROSS JOIN ranges AS r
WHERE t.tran_date BETWEEN r.prior_start AND r.prior_end
  AND t.tran_sales_factor = 1
```

## YTD YoY template — item level

```sql
WITH cutoff AS (
    SELECT max(trde_date) AS max_date
    FROM transaction_details
    WHERE trde_date <= today()
      AND trde_item != '-1'
      AND trde_net_price != 0
      AND trde_void_time = ''
),
ranges AS (
    SELECT
        max_date,
        toStartOfYear(max_date) AS current_start,
        max_date AS current_end,
        addYears(toStartOfYear(max_date), -1) AS prior_start,
        addYears(max_date, -1) AS prior_end
    FROM cutoff
)
SELECT
    'current_ytd' AS period,
    sum(td.trde_qty * td.trde_qty_ratio) AS qty,
    sum(td.trde_net_value) AS revenue
FROM transaction_details AS td
CROSS JOIN ranges AS r
WHERE td.trde_date BETWEEN r.current_start AND r.current_end
  AND td.trde_item != '-1'
  AND td.trde_net_price != 0
  AND td.trde_void_time = ''

UNION ALL

SELECT
    'prior_ytd' AS period,
    sum(td.trde_qty * td.trde_qty_ratio) AS qty,
    sum(td.trde_net_value) AS revenue
FROM transaction_details AS td
CROSS JOIN ranges AS r
WHERE td.trde_date BETWEEN r.prior_start AND r.prior_end
  AND td.trde_item != '-1'
  AND td.trde_net_price != 0
  AND td.trde_void_time = ''
```

## Joined query rules
When joining `transactions` and `transaction_details`:
- Join on:
  - `t.pk = td.transactionid`
  - `t.tran_date = td.trde_date`
- Apply date filters on both tables.
- Use the cutoff date consistently across both sides.

Example:

```sql
WITH cutoff AS (
    SELECT max(tran_date) AS max_date
    FROM transactions
    WHERE tran_date <= today()
),
ranges AS (
    SELECT
        toStartOfYear(max_date) AS current_start,
        max_date AS current_end
    FROM cutoff
)
SELECT
    td.item_name,
    sum(td.trde_qty * td.trde_qty_ratio) AS qty,
    sum(td.trde_net_value) AS revenue
FROM transactions AS t
INNER JOIN transaction_details AS td
    ON t.pk = td.transactionid
   AND t.tran_date = td.trde_date
CROSS JOIN ranges AS r
WHERE t.tran_date BETWEEN r.current_start AND r.current_end
  AND td.trde_date BETWEEN r.current_start AND r.current_end
  AND t.tran_sales_factor = 1
  AND td.trde_item != '-1'
  AND td.trde_net_price != 0
  AND td.trde_void_time = ''
GROUP BY td.item_name
ORDER BY revenue DESC
```

## WTD guidance
- WTD can be ambiguous depending on business week definition.
- Default to ClickHouse `toStartOfWeek()` unless business instructions specify otherwise.
- For WTD comparisons, always compare through the same weekday cutoff.
- Do not compare a partial current week to a full previous week.

## QTD guidance
- Use `toStartOfQuarter(max_date)` for the current quarter start.
- Prior-year QTD ends on `addYears(max_date, -1)`.

## Leap year guidance
- Prefer using `addYears(max_date, -1)` for prior-year cutoff logic.
- This handles date shifting more safely than manually reconstructing month/day values.
- If a leap-year edge case affects business interpretation, mention it briefly in the response.

## Prechecks before running to-date queries
Before executing a to-date query:
1. Identify whether the query is transaction-level or item-level.
2. Determine the correct cutoff source:
   - `max(tran_date)`
   - `max(trde_date)`
3. Build equivalent current and comparison ranges.
4. Ensure the prior period is not longer than the current period.
5. Apply all standard table filters:
   - transaction-level: typically `tran_sales_factor = 1`
   - item-level: `trde_item != '-1'`, `trde_net_price != 0`, `trde_void_time = ''`
6. If joining, filter dates on both tables.

## Common mistakes to avoid
- Using calendar today instead of latest available data date
- Comparing current partial month to prior full month
- Comparing current partial year to prior full year
- Using different cutoff logic across joined tables
- Forgetting required item-level exclusions
- Using transaction revenue logic for item-level revenue
- Forgetting `tran_sales_factor = 1` for sales-focused transaction queries

## Response guidance
- If the user asks for MTD/YTD/QTD/WTD without fixed dates, assume dynamic to-date logic based on latest available data.
- If relevant, briefly mention the cutoff date used.
- Example: “Using latest available data through 2026-03-05 for equal-period comparison.”
- Keep explanations concise unless the user asks for methodology details.
