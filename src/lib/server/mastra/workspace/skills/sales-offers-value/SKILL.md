---
name: sales-offers-value
description: How /sales/offers values an offer — offer net, add-on net, food cost, contribution, margin and verdict rules, VAT vs the 1.07 pricing buffer, dim_offers discount semantics, cache vs live figures — with worked examples for the Offers Value Assistant.
---

# Offers value (/sales/offers)

The page and the assistant tools share one valuation (`valueOffer` in
`src/lib/services/sales-offers.ts`). Relay tool numbers; do not recompute them.

## Definitions

| Term           | Meaning                                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offer net      | Net sales (excl. VAT, after discounts) of every POS line whose combo head is the offer code: offers priced on the header and offers priced on their components both count. |
| Units          | Quantity of the offer header line.                                                                                                                                         |
| Orders         | Distinct orders that contain the offer. Qty/txn = units / orders.                                                                                                          |
| Add-on net     | Everything else in those orders, excluding `INTERNAL USE` lines (delivery charges). When one order holds two offers, its add-on is split evenly between them.              |
| Food cost      | Per unit: `fc_eur` when set, else `fc_perc × selling_price / 1.05`; × units. EUR excl. VAT.                                                                                |
| Contribution   | `offer net − food cost + add-on net × (1 − brand ideal FC %)`. Add-on items have no per-item cost, so they are costed at the brand's ideal FC %.                           |
| Margin         | `contribution / (offer net + add-on net)`.                                                                                                                                 |
| Brand target   | `1 − ideal FC %` (set per brand on the brand admin page).                                                                                                                  |
| Discount given | `dim_offers.discount_amount / 1.05 × units`, EUR excl. VAT. Empty when the catalogue row has no list price.                                                                |

## Verdicts

1. `no_cost` — the offers catalogue (dim_offers) has neither `fc_eur` nor `fc_perc` + selling price. Fix: Offers data quality.
2. `no_target` — the brand has no ideal FC %. Fix: brand admin page.
3. `loss` — contribution ≤ 0.
4. `positive` — margin ≥ brand target.
5. `below_target` — profitable, but margin under the target.

Totals of food cost and contribution only add offers that have them
(`no_cost` / `no_target` count as 0) — say so when you quote them.

## Domain rules (verified)

- `fc_perc` is a fraction of the **ex-VAT** selling price; ex-VAT = price / 1.05.
- The 1.07 factor in the Offers data quality ideal price is a pricing **buffer, not VAT**.
  Ideal price = (FC € / ideal FC %) × 1.05 × 1.07. Never divide by 1.07 to get net.
- `dim_offers.discount_amount = ideal_price − selling_price`. On rows created by the
  Offers data quality form (they carry `fc_eur`), ideal_price is an FC target, not a list
  price, so the page ignores their discount (Discount given is empty).
- `trde_normal_price` is the price actually charged, not a list price.
- "Net" always means net of VAT and of discounts.
- Order hours are Cyprus local time already.

## Cache vs live

- All time, all channels, all locations → Postgres cache rebuilt daily at 05:00
  (`computedAt` in the tool output). Verdicts are recomputed on read, so a changed brand
  target shows immediately.
- Any date range, channel or location → computed live (a few seconds). Channel/location
  filters always need a date range; ranges are capped at 366 days.
- Empty cache → tell the user to open /sales/offers or press Refresh there.

## Worked examples

**Food cost from fc_perc.** Selling price €10.50, fc_perc 0.30, 200 units:
unit cost = 0.30 × 10.50 / 1.05 = €3.00 → food cost €600.00.

**Contribution and verdict.** Offer net €1,800, food cost €600, add-on net €900,
ideal FC 28 % → contribution = 1,800 − 600 + 900 × 0.72 = €1,848; margin =
1,848 / 2,700 = 68.4 %; target = 72 % → `below_target` (profitable, thin margin).

**Loss.** Offer net €500, food cost €700, add-on net €100, ideal FC 30 % →
500 − 700 + 70 = −€130 → `loss`. The offer alone keeps −40 % of its sales; the
basket does not rescue it.

**Offer VS.** Two offers rarely ran equally long, so compare the per-active-day rows
(units, orders, offer net, contribution per active day) before lifetime totals; the
tool marks the winner per metric (`a` = first code, `b` = second).

## Question → tool

Optional filters take `null` for "not used" (verdict null = all verdicts). Never
loop over verdicts or offers: one call with `codes` returns up to 20 offers.

| Question                                    | Tool                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| Which offers lose money / are below target? | getOfferValues with `verdict`                                               |
| Units / net / verdict of offers A and B     | ONE getOfferValues call with `codes: [A, B]`, `verdict: null`               |
| Top 10 offers by contribution this summer   | getOfferValues with from/to, `sortBy: contribution`, `limit: 10`            |
| Why is X below target?                      | compareOffers with one code (returns the reason)                            |
| X vs Y                                      | compareOffers with both codes                                               |
| When do offers sell best?                   | getOfferCalendar                                                            |
| What sells on Friday 19:00?                 | getOfferSlotSales with `weekday: 5, hour: 19`                               |
| Offers on Wolt at the Limassol store        | listOfferFilterOptions, then getOfferValues with channels/locations + range |
