---
name: sales-to-date-rules
description: Rules and ClickHouse SQL patterns for MTD, YTD, QTD, WTD, and YoY-to-date analysis using the latest available warehouse date so comparisons use equivalent date ranges.
---

# To-Date Comparison Rules

Use this skill for any query involving MTD / YTD / QTD / WTD /
period-to-date, YoY to-date comparisons, current-vs-prior period where the
current period is incomplete, or "today" / "current month" / "current year"
style dynamic date logic.

## Core business rule

- The warehouse is typically 1 day behind the calendar date — do **not**
  assume data exists through the current calendar date.
- For to-date analysis, **always use the latest available warehouse date as
  the cutoff date**.
- Prior-period comparisons must use the **equivalent relative cutoff date**.
- Never compare a partial current period to a longer prior period.

## Default cutoff logic

- Preferred: determine the latest available date from the relevant table:
  - `max(tran_date)` for transaction-level queries
  - `max(trde_date)` for item-level queries
- Fallback: `today() - 1` if a dynamic max-date check is not practical.
- When joining, use cutoff logic appropriate to the grain and filter both
  tables consistently.

## Interpretation rules

Unless the user gives fixed dates, interpret:

- "today" = latest available warehouse date
- "current MTD/YTD/QTD/WTD" = period start through latest available date

If the user gives explicit calendar dates, use those exact dates.

## Comparison rules

- YoY to-date: current period ends at the latest available date; the
  prior-year period ends at the same relative date one year earlier.
- Compare equal-length windows only; truncate the comparison period to the
  same relative cutoff.
- Never: current YTD through Mar 5 vs prior YTD through Mar 6; current MTD vs
  full prior month; current WTD through Tuesday vs prior full week.

## Date range examples

If latest available date = `2026-03-05`:

- YTD current = 2026-01-01 → 2026-03-05; prior = 2025-01-01 → 2025-03-05
- MTD current = 2026-03-01 → 2026-03-05; prior = 2025-03-01 → 2025-03-05
- QTD current = 2026-01-01 → 2026-03-05; prior = 2025-01-01 → 2025-03-05
- WTD = start of current reporting week → 2026-03-05; compare through the
  equivalent weekday cutoff only

## Useful ClickHouse functions

`today()`, `addDays(date, n)`, `addYears(date, n)`, `toStartOfMonth(date)`,
`toStartOfQuarter(date)`, `toStartOfYear(date)`, `toStartOfWeek(date)`,
`toDate(...)`

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

- Join on `t.pk = td.transactionid` AND `t.tran_date = td.trde_date`.
- Apply date filters on both tables with the same cutoff.

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

## WTD / QTD / leap-year guidance

- WTD: default to `toStartOfWeek()` unless business instructions say
  otherwise; always compare through the same weekday cutoff; never a partial
  current week vs a full previous week.
- QTD: `toStartOfQuarter(max_date)`; prior-year QTD ends
  `addYears(max_date, -1)`.
- Leap years: prefer `addYears(max_date, -1)` over manually reconstructing
  month/day values; mention leap-year edge cases briefly if they affect the
  interpretation.

## Prechecks before running to-date queries

1. Transaction-level or item-level? Pick the cutoff source accordingly
   (`max(tran_date)` / `max(trde_date)`).
2. Build equivalent current and comparison ranges.
3. Ensure the prior period is not longer than the current period.
4. Apply standard filters: transaction-level typically
   `tran_sales_factor = 1`; item-level `trde_item != '-1'`,
   `trde_net_price != 0`, `trde_void_time = ''`.
5. If joining, filter dates on both tables.

## Common mistakes to avoid

- Using calendar today instead of the latest available data date
- Comparing a partial current month/year to a full prior month/year
- Different cutoff logic across joined tables
- Forgetting the item-level exclusions or `tran_sales_factor = 1`
- Using transaction revenue logic for item-level revenue

## Response guidance

- Assume dynamic to-date logic based on the latest available data when the
  user asks MTD/YTD/QTD/WTD without fixed dates.
- Briefly mention the cutoff date used, e.g. "Using latest available data
  through 2026-03-05 for equal-period comparison."
- Keep methodology explanations concise unless asked.
