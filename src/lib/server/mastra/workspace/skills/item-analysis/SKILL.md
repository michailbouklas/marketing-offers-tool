---
name: item-analysis
description: Counting rules, known differences from the POS report and SQL hints for the Item Analysis report (/sales/item-analysis) — per-item quantity, transactions, net sales, Grp %, Tot %, Qty/Tr.
---

# Item Analysis

The page rebuilds the POS (Service Manager Pro) "Item Analysis Report" from
`transaction_details` in ClickHouse. It shows one brand, grouped by POS category
(`item_category`).

## Counting rules

The warehouse stores combos differently from the POS, so a plain
`GROUP BY trde_item` is wrong. With a plain group-by, Pizzas get about 59% of net
instead of the POS's 43%, and Toppings get thousands of units instead of a few hundred.

| Column    | Rule                                                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Item      | `if(trde_combo_item = '', trde_item, trde_combo_item)`: every line belongs to its combo head or its parent line                                      |
| Quantity  | `sum(trde_qty × trde_qty_ratio)` of the item's own lines (`trde_item = code`) at `trde_sub_line = 0`, at any combo position; a half pizza counts 0.5 |
| Net sales | `sum(trde_net_value)` of ALL lines belonging to the item (ex-VAT). Combo money sits on the child lines and is booked to the head                     |
| Trans     | `uniqExact((trde_date, trde_location, trde_division, trde_no))`; category and grand totals are distinct counts, not sums                             |
| Grp %     | item ÷ its category total                                                                                                                            |
| Tot %     | item ÷ grand total                                                                                                                                   |
| Qty/Tr    | item quantity ÷ all transactions of the selection × 100                                                                                              |

Always filter `lower(brand) = <alias>`, `trde_void_time = ''`, `trde_item != '-1'`,
`item_category != 'INTERNAL USE'` (delivery charges) and `trde_qty_ratio <= 1`
(Half & Half container lines, which the POS does not list). Keep **only orders
that have a header row in `transactions`** (match on date, location, division and
number). About 10% of order keys in `transaction_details` have no header, and the
POS does not report them. The channel also comes from that header:
`trim(dim_division_group_channel)`.

### Worked examples

A Pair Offer order has these lines:

- head `PH31800FWPL` (pos -1, net 0)
- two pizzas (pos 1 and 2, nets 0 and 20.78)
- their toppings (sub-lines, one with net 1.78)

The report books qty 1 to the Pair Offer and €22.56 net to the offer. The pizzas and
toppings add nothing to the Pizzas or Toppings categories.

A Half & Half pizza has these lines:

- a header such as `PH31011LHHH` with ratio 2 and net 0, which is dropped
- two halves that point at themselves, each with ratio 0.5 (one row per half pizza)

Each half adds 0.5 to its pizza's quantity, which is why the POS shows values like 43.5.

## Agreement with the POS report (phcy 01–08/11/2026)

- **Item list:** the same 1,065 items on both sides.
- **Transactions:** exact for 1,062 items; 25,342 vs 25,340 overall.
- **Net sales:** within 5 cents for 1,062 items; +0.006% overall.
- **Quantity:** exact for 1,041 items.

Remaining known differences:

- **Meal and pair-offer quantity:** about 20 combo codes count differently in the
  POS (e.g. Value Meals "PLVD" is 821 in the POS vs 338 here, and "1+1 Free" is 0
  in the POS vs 304 here). The POS's combo quantity rule is not derivable from the
  warehouse columns. Net sales and transactions for these items match.
- **Missing days:** ClickHouse can lack days that the POS has (e.g. 13, 14 and
  17/11/2026 were not loaded). Totals then fall short; this is a loading gap, not a
  different formula.

When a user reports a mismatch, name the likely cause from this list. Do not
invent another one.

## SQL hints (querySalesSql fallback)

Hour-of-day for one item: join the line's order key to `transactions` (which also
applies the header rule) and use `toHour(trans_order_time)`. That time is already
Cyprus local time, so never apply `toTimeZone` to it. Keep the counting rules above.
