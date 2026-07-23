---
name: sales-business-overview
description: PHC Franchised Restaurants group structure (companies and brands), Novasero POS concepts, divisions and channels, discounts overview, revenue conventions, and new-vs-base store rules.
---

# PHC Franchised Restaurants — Business Overview

## Group Structure

PHC Franchised Restaurants is the parent group operating multiple brands
across the Republic of Cyprus. Each legal entity (company) may operate one or
more brands. Use `store_company` to distinguish legal ownership when needed.

| Company                               | Brand(s) Operated                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| PHC FRANCHISED RESTAURANTS PUBLIC LTD | Pizza Hut, KFC, Taco Bell (YUM! brands) — the group/parent company                              |
| AVANTAGE B&P CAFE LTD                 | PAUL                                                                                            |
| Avantage B&R Italian Restaurants Ltd  | Jamie Oliver                                                                                    |
| CATERCOM LTD                          | Verdi, Tavernaki, Remezzo, Pier One (`pierone`), Kypriakon, Hobo, Akashi — plus catering/events |
| CAYLINK LTD                           | Cafe Nero — Molos store only (`NER511` / `511-NERO MOLOS LIMASSOL`)                             |
| DAFERA LTD                            | Wagamama                                                                                        |
| HETAFRE TRADING LTD                   | Cafe Nero (all other stores)                                                                    |
| WOW BURGERS LTD                       | Burger King                                                                                     |
| ODL ONE DELIVERY (CYPRUS) LTD         | Third-party logistics / delivery drivers (not a brand)                                          |

> CAYLINK LTD exists solely for accounting purposes for one Cafe Nero store
> (Molos, Limassol). All other Cafe Nero stores are under HETAFRE TRADING LTD.
> ODL manages delivery drivers and equipment and delivers for most brands —
> it is a company, not a brand.

## POS System (Novasero)

- All stores run the NOVASERO POS; its data fills `transactions` and
  `transaction_details`, collected per brand and per store.
- `transactions.pk` is the primary key; join
  `transactions.pk = transaction_details.transactionid`.
- Orders carry a **receipt method** and a **division**. The division defines
  the nature of the sale (dine in, delivery, take away, …); the receipt
  method signals transaction attributes (coupon used, employee discount, …).
  These live only on `transactions` — join from `transactions` when you need
  them for item-level questions.
- `transaction_details` records ALL punched items, including cancelled or
  voided ones. To make detail net revenue match brand/store net revenue,
  keep only valid lines: `trde_void_series_number = 0` (non-zero means the
  item was voided and must not count in sales).

## Divisions and Channels

- `division_name` describes `tran_division`. Because there are many
  divisions, prefer the grouped columns for overviews:
  - `dim_division_group_source` — 'Own' (internal: dine in, take away, …) vs
    'External' (third-party logistics / external delivery).
  - `dim_division_group_channel` — the channel group (e.g. 'Dine In',
    'Delivery', 'Drive Through').
  - `dim_division_group_name` — a more generic division grouping.

## Aggregators

Aggregators are third-party marketplaces where the stores have presence; they
transfer orders to stores and usually deliver them. Main aggregators: Wolt,
Foody, Bolt (and Efood in Greece).

## Discounts and Offers

Two kinds of discounts:

- **Captured** discounts are tracked in Novasero: `transactions.tran_discount`
  holds the captured discount amount (net).
- **Non-captured** discounts occur mainly with offers or limited-time bundles
  where items aren't sold separately (common on aggregators but not only).
  For those, load the `sales-offers` skill.

## Sales Amounts / Revenue

The company standard for "sales" or "revenue" is the **net amount**,
excluding VAT and service charge (`tran_net` / `trde_net_value`).

## New and Base Stores

A store is "new" for its first 365 days of operation and "base" afterwards.
Take the first day of sales found in `transactions` as the beginning of
operation. E.g. a "YoY sales comparison of base stores for 2025" means the
2025 stores shown must have operated for more than 365 days.
