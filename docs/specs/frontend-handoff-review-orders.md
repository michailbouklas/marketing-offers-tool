# Frontend handoff: order details on negative reviews

**Date:** 2026-07-13
**From:** aggregator-merchant-scraper (owns the DB + Prisma migrations)
**To:** frontend/UI team (reads the DB via `MERCHANT_SCRAPES_DATABASE_URL`)
**Builds on:** `frontend-handoff-historical-data.md` §"Reviews table" — you already render `Review.rating/comment/reviewedAt` joined to `Store`. This doc adds the order behind each of those reviews.

## TL;DR

- Two new columns on the **`Review` table you already query** (migration `20260713084940_review_order_details`):
  `orderDetails JSONB` — the full order behind the review (timeline, items, totals, payment), and
  `orderScrapedAt TIMESTAMP` — when that order was last fetched.
- The scraper opens each reviewed order's page and captures what the portal's own order drawer shows. One JSON object per review; no new table, no new view, no new join.
- **`orderDetails IS NULL` = not enriched (yet)** — reviews scraped before 2026-07-13, or the order page couldn't be read. Render "order details unavailable", never an empty order.
- Inside the JSON, **money fields are raw display strings** (`"€13.80"`, `"-€1.79"`) and can be **legitimately null** — a sizable minority of orders (~1/3 in the first sample) simply have no commission/earnings breakdown in the portal. Null ≠ €0.
- Primary UI: an **expandable order panel on the review row** you already have — the reviewer's complaint next to what was actually ordered and how the delivery went is the whole value of this dataset.

---

## 1. Coverage and lifecycle

- Enrichment ships with the scrape runs starting **2026-07-13**. It applies to **every commented review that carries an order id** (that's every review you currently display — the pipeline only keeps commented ones), not just 1–2 stars.
- The portal's reviews list is all-time, and the scraper re-fetches order details on every pass — so **existing reviews gain `orderDetails` retroactively** as each store is re-scraped. After the next full batch, expect near-complete coverage; until then it grows store by store. (As of this writing only the two smoke stores are populated.)
- `orderDetails` is refreshed on every scrape of the store; `orderScrapedAt` is the last fetch time. A run that fails to read an order **never overwrites** previously stored details — the column only moves forward.
- `Review.externalOrderId` (already there) equals `orderDetails.orderId`. The JSON echoes it purely for self-containment; keep keying on `externalOrderId`.

---

## 2. The JSON contract

Top-level shape (TypeScript source of truth: `OrderDetails` in `src/foody/types.ts`):

```jsonc
{
  "orderId": 1037550778,
  "status": "Completed", // string | null — the drawer's status chip
  "timeline": [
    // ordered milestones; may be empty
    {
      "key": "DISPLAYED_AT_VENDOR_originally_DISPLAYED_AT_VENDOR",
      "label": "Order received", // display label
      "time": "23:30", // "HH:MM" wall-clock string | null — NOT a timestamp
      "notes": ["Accepted in 1 sec"], // extra display lines, e.g. "7 min. late",
    }, //   "Estimated to deliver by 23:58"
    {
      "key": "ACCEPTED_originally_ACCEPTED",
      "label": "Order accepted",
      "time": "23:30",
      "notes": [],
    },
    {
      "key": "PICKED_UP_originally_PICKED_UP",
      "label": "In Delivery",
      "time": "23:54",
      "notes": [],
    },
    {
      "key": "DELIVERED_originally_DELIVERED",
      "label": "Order delivered",
      "time": "00:05",
      "notes": ["7 min. late", "Estimated to deliver by 23:58"],
    },
  ],
  "products": [
    // the order's line items; may be empty
    {
      "quantity": 2, // number | null
      "name": "Colonels Fillet Burger Regular Meal",
      "price": "€13.80", // raw display string | null — line total as shown
      "options": [
        // modifiers/side choices under the item
        { "quantity": 1, "name": "Regular Fries", "price": "€0.00" },
        { "quantity": 1, "name": "Coca-Cola Zero 330ml", "price": "€0.00" },
      ],
    },
  ],
  "subtotal": "€13.80", // all money fields: raw string | null
  "commission": "-€1.79", // negative = deducted from the merchant
  "commissionRate": 13, // number | null — percent, the one parsed numeric
  "taxCharge": "-€0.34",
  "estimatedEarnings": "€11.67", // portal's own "estimated" caveat applies
  "paymentMethod": "Online", // "Online" | "Cash" | null
  "deliveryType": "Platform delivery",
  "scrapedAt": "2026-07-13T08:57:51.660Z", // ISO — same value as the orderScrapedAt column
}
```

Semantics you must respect:

| Field                                                               | Notes                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timeline[].key`                                                    | Stable machine key from the portal (`DISPLAYED_AT_VENDOR`, `ACCEPTED`, `COURIER_NEAR_PICK_UP`, `PICKED_UP`, `DELIVERED` observed so far — treat as open set). Use it for icons/ordering logic; use `label` for display.                      |
| `timeline[].time`                                                   | **Wall-clock "HH:MM" only — the portal shows no dates.** A delivery can cross midnight (`23:30` → `00:05`); never compute durations by naive subtraction, and never render these as timestamps of `reviewedAt`'s day.                        |
| `timeline[].notes`                                                  | Display strings, not structured data. Lateness (`"7 min. late"`) and acceptance speed (`"Accepted in 1 sec"`) live here — regex if you must aggregate, but treat parses as best-effort.                                                      |
| money strings                                                       | Include `€` and sign, e.g. `"-€1.79"`. Parse with something like `parseFloat(s.replace(/[€\s]/g, ""))` if you need numbers; keep the string for display.                                                                                     |
| `commission` / `commissionRate` / `taxCharge` / `estimatedEarnings` | **Null for a substantial minority of orders — the portal genuinely omits the earnings block for them** (verified against raw drawer HTML; no date pattern). Null = "portal doesn't show it", never €0. Render the section only when present. |
| `status`                                                            | Observed `"Completed"`; other states (cancelled/rejected wording) will appear as the portal renders them — display verbatim, don't enum-gate.                                                                                                |

---

## 3. What to build

In rough order of value:

1. **Order panel on the review row (the headline feature)** — expand a review to show: status chip, the timeline as a vertical stepper (label + time, notes as secondary text), the item list with options indented under each product, and the totals block when present. This mirrors the portal's own drawer, which is what ops staff already know how to read. The payoff is instant context: _"I was missing two portions of chips"_ next to the actual line items.
2. **Lateness badge on the review list** — if any `timeline[].notes[]` matches `/(\d+)\s*min\.?\s*late/`, badge the review ("7 min late"). A 1-star review with a big lateness number explains itself; one without points at food quality instead.
3. **Complaint-vs-delivery split (per store)** — share of negative reviews whose order was late vs on time. This is the store manager's "is it us or the courier?" chart; `deliveryType` ("Platform delivery") adds the attribution.
4. **Order value vs rating** — scatter/bins of parsed `subtotal` against `rating`: are the angriest customers the biggest baskets? Pair with `estimatedEarnings` (when present) to show revenue at risk from repeat-complaint items.
5. **Item frequency in negative reviews** — flatten `products[].name` across a store's negative reviews and rank. Items that keep appearing under 1-star reviews are menu problems, not delivery problems. (Normalize names — the same burger appears in meal and single variants.)
6. **Acceptance-speed footnote** — `"Accepted in …"` from the first milestone's notes; slow acceptance correlating with lateness complaints is actionable staffing signal.

---

## 4. Recipes

`orderDetails` is `jsonb` — the usual operators apply. Quoted camelCase everywhere, as with the rest of this schema.

### Reviews with their order summary (your existing list, extended)

```sql
SELECT r.id, r.rating, r.comment, r."reviewedAt", s.name AS store,
       r."orderDetails" ->> 'status'            AS order_status,
       r."orderDetails" ->> 'subtotal'          AS subtotal,
       r."orderDetails" -> 'timeline'           AS timeline,      -- render client-side
       r."orderDetails" -> 'products'           AS products,
       r."orderScrapedAt"
FROM "Review" r
JOIN "Store" s ON s.id = r."storeId"
WHERE r."storeId" = $1
ORDER BY r."reviewedAt" DESC NULLS LAST;
```

`orderDetails` is NULL when not enriched — keep the row, hide the panel.

### Enrichment coverage (how much of the UI can light up)

```sql
SELECT COUNT(*)                                          AS reviews,
       COUNT(r."orderDetails")                           AS with_order,
       ROUND(COUNT(r."orderDetails")::numeric / NULLIF(COUNT(*), 0), 2) AS coverage
FROM "Review" r;
```

### Late-delivery share among negative reviews, per store

```sql
SELECT s.name,
       COUNT(*) FILTER (WHERE note.value ~ 'min\.? late') AS late_orders,
       COUNT(DISTINCT r.id)                               AS enriched_reviews
FROM "Review" r
JOIN "Store" s ON s.id = r."storeId"
LEFT JOIN LATERAL jsonb_array_elements(r."orderDetails" -> 'timeline') AS m(value) ON TRUE
LEFT JOIN LATERAL jsonb_array_elements_text(m.value -> 'notes') AS note(value)
       ON note.value ~ 'min\.? late'
WHERE r."orderDetails" IS NOT NULL AND r.rating <= 2
GROUP BY s.name
ORDER BY late_orders DESC;
```

### Most-complained-about items (one store)

```sql
SELECT p.value ->> 'name' AS item, COUNT(*) AS appearances
FROM "Review" r,
     jsonb_array_elements(r."orderDetails" -> 'products') AS p(value)
WHERE r."storeId" = $1 AND r."orderDetails" IS NOT NULL AND r.rating <= 2
GROUP BY 1
ORDER BY appearances DESC
LIMIT 15;
```

### Parsed order value vs rating

```sql
SELECT r.rating,
       NULLIF(regexp_replace(r."orderDetails" ->> 'subtotal', '[^0-9.,-]', '', 'g'), '')::numeric AS subtotal_eur
FROM "Review" r
WHERE r."orderDetails" IS NOT NULL
  AND r."orderDetails" ->> 'subtotal' IS NOT NULL;
```

(Amounts observed use `.` decimals; the regex strip is belt-and-braces.)

---

## 5. Prisma notes

In your schema copy, add to your read-only `Review` model:

```prisma
orderDetails   Json?
orderScrapedAt DateTime?
```

`orderDetails` deserializes to the §2 shape — a shared `OrderDetails` TS type on your side is worth it; treat every field except `orderId`, `timeline`, `products`, `scrapedAt` as nullable, and the two arrays as possibly empty. For the JSONB-path recipes, `$queryRaw` is the pragmatic route.

---

## 6. Pitfalls checklist

- ❌ Treating `orderDetails IS NULL` as "no order existed" — it means _not enriched_; the review still has `externalOrderId`. Coverage is growing store-by-store from 2026-07-13.
- ❌ Rendering missing `commission`/`estimatedEarnings` as €0 — the portal omits the whole earnings block for many orders; null = not shown, and the row simply shouldn't render.
- ❌ Doing date math on `timeline[].time` — wall-clock "HH:MM" strings, no date, can cross midnight. Display only; lateness comes from the `notes` text.
- ❌ Charting money strings without parsing (or parsing without stripping `€`/sign) — and don't sum `estimatedEarnings` into anything authoritative; the portal itself calls it an estimate.
- ❌ Assuming `timeline[].key` is a closed enum or that every order has all five milestones — pickup orders/cancellations will differ; render whatever arrives, in array order.
- ❌ Recomputing item totals from `products` — option prices are often `€0.00` (bundled) and the line `price` is the portal's own line total; reconcile against `subtotal` only for display, never against `foody_metrics_by_period` sales.
- ❌ Caching the JSON keyed by review id forever — `orderScrapedAt` moves when a store is re-scraped; bust on it.

## Questions / changes

Canonical shape: `OrderDetails` in `src/foody/types.ts`; column definitions in `prisma/migrations/20260713084940_review_order_details/migration.sql`. Scraper-side semantics (how the drawer is read, why fields can be null): `src/foody/sections/order-enrichment.ts` and `docs/specs/review-order-enrichment.md`. Ask us for new columns/views — don't create them in this DB yourselves.
