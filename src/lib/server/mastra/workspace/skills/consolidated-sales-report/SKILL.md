---
name: consolidated-sales-report
description: Metric definitions, filter semantics and worked examples for the Consolidated Sales Report (/sales/consolidated-sales-report) — trans, gross, discount, net, average ticket per company / store / city, period comparisons.
---

# Consolidated Sales Report

The page lists sales per **store** (`store_bi_name`), grouped by **company**
(`store_company`, labelled with the SAP company name from
`apidata_replica.dim_store`), with a subtotal per company and a grand total.
The city is `dim_store.district`. All numbers come from the `transactions`
table in ClickHouse.

## Metrics

| Column    | Definition                                                          |
| --------- | ------------------------------------------------------------------- |
| Trans     | `countIf(tran_sales_factor = 1)` — sales transactions (orders)      |
| Gross     | `sum(tran_gross × tran_sales_factor)` — before discount             |
| Discount  | `sum(tran_discount × tran_sales_factor)`                            |
| Net       | `sum(tran_net × tran_sales_factor)` — after discount, excluding VAT |
| Avg gross | Gross ÷ Trans (average ticket before discount); null when Trans = 0 |
| Avg net   | Net ÷ Trans (average ticket); null when Trans = 0                   |

- `tran_sales_factor = -1` would be a return; in this warehouse it is always 1,
  so returns never reduce the numbers. Do not promise a returns breakdown.
- Subtotals and the grand total are sums of the store lines; their averages are
  recomputed from the summed money and transactions (never an average of
  averages).
- Stores with zero transactions in the range are not listed.

## Filters

- **Brands**: aliases from the Brand scope section; empty = every brand the user
  may see. Out-of-scope brands are refused by the tools.
- **Dates**: inclusive `from`/`to` (YYYY-MM-DD). Without dates the page uses the
  last 30 days ending at the latest loaded day (the warehouse lags ~1 day).
  One call covers at most 366 days.
- **Channels**: `trim(dim_division_group_channel)` values, e.g. Wolt, Foody
  and others. Get exact names from `getConsolidatedOptions`.
- **Stores**: `store_bi_name` codes (the `store` field); the page shows the
  `location` name. Map names to codes with `getConsolidatedOptions`.
- **Cities**: `dim_store.district` values.
- **Weekdays**: ClickHouse `toDayOfWeek`, 1 = Monday … 7 = Sunday.

## Free SQL (only when the typed tools cannot answer)

Load the "sales-sql" skill first. Then:

- `trans_order_time` is already Cyprus local time — never wrap it in
  `toTimeZone`; use `toHour(trans_order_time)` directly.
- Foody rows carry a trailing space in `dim_division_group_channel`: always
  `trim()` it, or most Foody sales disappear.
- Keep the brand filter (`lower(brand) IN (...)` with scoped aliases only) and a
  `tran_date` range on every query.

## Worked examples

**"Which store had the highest average ticket last month?"**
Call `getConsolidatedReport` with last month's dates, `groupBy: "store"`.
Sort the returned stores by `avgNet`, answer with the top store, its average
net ticket and transactions, and state the dates and brands used.

**"How did Nicosia do this month vs the same period last year?"**

1. `getConsolidatedReport` with `cities: ["Nicosia"]` (exact value from
   `getConsolidatedOptions`) for this month to date.
2. The same call for the same dates one year earlier.
3. Report Trans, Net and Avg net for both periods with the change in % and
   absolute EUR: change % = (this − last) ÷ last × 100.

**"Net sales per company on weekends via Wolt"**
`getConsolidatedReport` with `channels: ["Wolt"]`, `weekdays: [6, 7]`,
`groupBy: "company"`; answer with the company subtotals and the grand total.
