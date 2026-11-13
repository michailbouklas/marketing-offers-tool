---
name: sales-delivery
description: Delivery / aggregator channel sales rules for the /sales/delivery page — which channels count, the Foody trailing-space trap, delivery-charge lines, refunds, date defaults and load gaps — plus worked examples mapping questions to the delivery tools or free SQL.
---

# Delivery sales (/sales/delivery)

## Which sales count as delivery

Delivery = rows of `transactions` whose **trimmed**
`dim_division_group_channel` is one of:

`Wolt`, `Wolt GR`, `Bolt`, `Foody`, `Efood`, `Skroutz GR`, `Delivery Man`, `Radyes`

App orders collected in store are included (they are POS transactions on the
aggregator channel). Own-fleet delivery (Call Center / Online with division
group Delivery) is **not** part of this page.

## Rules for any free SQL

1. **Always `trim(dim_division_group_channel)`.** Foody is stored both as
   `'Foody'` and `'Foody '` (trailing space). Without `trim()` roughly 3/4 of
   Foody disappears. Group and filter on the trimmed value.
2. **No refund handling.** `tran_sales_factor` is always 1 on these channels;
   the page does not filter on it, so do not add it (it changes nothing, but
   keep queries identical to the page).
3. **Net excludes delivery charges.** Delivery-charge item lines (item
   category `INTERNAL USE`) are outside `tran_net`. At item level, exclude
   `item_category = 'INTERNAL USE'` when summing towards order net.
4. **Brand filter**: `lower(brand) IN (...)`, one brand per page.
5. **Dates**: `tran_date BETWEEN from AND to` — always filter dates.

```sql
SELECT trim(dim_division_group_channel) AS channel,
       sum(tran_net) AS net, count() AS orders
FROM transactions
WHERE tran_date BETWEEN '2026-01-01' AND '2026-11-12'
  AND lower(brand) = 'bk'
  AND trim(dim_division_group_channel) IN
      ('Wolt','Wolt GR','Bolt','Foody','Efood','Skroutz GR','Delivery Man','Radyes')
GROUP BY channel
ORDER BY net DESC
```

## Date defaults

- No `from` → **January 1 of the `to` year** (year to date), max 366 days.
- No `to` → the latest loaded day. The warehouse is usually **one day
  behind**: "this month" / MTD runs from the 1st of the latest data day's
  month to that day, not to today.
- MTD on the page = 1st of the `to` month → `to`, even when `from` is later.
- **Known Foody load gap: 2026-06-22** — a zero or dip in Foody that day is
  missing data, not a real drop. Mention it ONLY when the range includes
  2026-06-22 AND the answer involves Foody; never as a generic caveat.

## Metrics

| Metric             | Definition                                            |
| ------------------ | ----------------------------------------------------- |
| Net                | sum(tran_net), excl. VAT                              |
| Gross              | sum(tran_gross) — net before discounts                |
| Discounts          | sum(tran_discount)                                    |
| Orders             | count() of transactions                               |
| Avg ticket         | net / orders                                          |
| Share              | channel net / all delivery net in the range           |
| Discount rate      | discount / gross                                      |
| Offer contribution | offer net − food cost + add-on net × (1 − ideal FC %) |
| Offer margin       | contribution / (offer net + add-on net)               |

Offer verdicts: `positive` (margin ≥ 1 − ideal FC %), `below_target`,
`loss` (contribution ≤ 0), `no_cost` (no food cost in dim_offers),
`no_target` (brand has no ideal FC %).

Campaigns are the marketing tool's registered aggregator offers (Wolt, Bolt,
Foody, Efood) matched to POS items on `novasero_item_code` + channel. Wolt GR,
Skroutz GR, Delivery Man and Radyes have no registered campaigns.

## Worked examples

**"How is delivery doing this year?"** →
`getDeliveryOverview({ brand, channel: null })` — ONE call, all channels combined, YTD. Answer with range net,
orders, avg ticket, then MTD, then the top channels by share.

**"What share of delivery is Wolt in October?"** →
`getDeliveryOverview({ brand, from: "2026-10-01", to: "2026-10-31" })`, read
`channelShares`.

**"Compare Wolt vs Bolt since the summer"** →
`compareDeliveryChannels({ brand, channels: ["Wolt", "Bolt"], from: "2026-06-01" })`.
Lead with which one wins on net and avg ticket; mention discount rate. If the
result has a `note`, a requested channel had no sales and was substituted.

**"Which Wolt offers lose money?"** →
`getDeliveryOfferValues({ brand, channel: "Wolt", from, to })`, filter
`verdict = "loss"`. One channel per call; ask before running every channel.

**"Which campaigns were live on Bolt in May?"** →
`getDeliveryCampaigns({ brand, from: "2026-05-01", to: "2026-05-31" })`,
keep `channel = "Bolt"`.

**"Which hour of the day is busiest on Foody?"** (not on the page) → load
`sales-sql`, then `querySalesSql` with `trim(dim_division_group_channel) = 'Foody'`
and `toHour(trans_order_time)` (already local time; never `toTimeZone`).
