---
name: invoices-sql
description: Full schema reference and proven SQL query patterns for the aggregator invoices database (Wolt and Bolt headers and lines, brand/project-code linkage, ERP sync status).
---

# Aggregator invoices SQL

PostgreSQL database. Table names are mixed-case, so they MUST always be
double-quoted: `"api_WOLT_header"`, not `api_WOLT_header`.

## Tables

### "api_WOLT_header" — one row per Wolt invoice

| Column           | Type          | Notes                                                  |
| ---------------- | ------------- | ------------------------------------------------------ |
| documentid       | text          | Primary key, joins to lines                            |
| documentdate     | timestamp     | Invoice issue date (nullable)                          |
| invoicenumber    | text          | Human-facing invoice number                            |
| timeframe        | text          | Period the invoice covers, free text                   |
| remarks          | text          | Free-text remarks                                      |
| bpcode / bpname  | text          | Business-partner code / legal name                     |
| partnername      | text          | Store (venue) name — use this for per-store questions  |
| distributionrule | text          | ERP distribution rule                                  |
| project          | text          | Project code; links the store to a brand               |
| erpdatabase      | text          | Target ERP company database                            |
| createdat        | timestamp     | Row import time (not the invoice date)                 |
| erpsent          | text          | 'Y' when synced to the ERP, 'N' (default) when pending |
| erpcreatedat     | timestamp     | When the ERP document was created                      |
| totalpayout      | numeric(19,6) | Net payout of the whole invoice, EUR                   |

### "api_WOLT_lines" — Wolt invoice line items

PK `(documentid, linenumber)`; `documentid` FKs to `"api_WOLT_header"`.

| Column                | Type          | Notes                                     |
| --------------------- | ------------- | ----------------------------------------- |
| transtype             | text          | Transaction-type code — see section below |
| linedetails           | text          | Free-text description (up to ~1000 chars) |
| amount                | numeric(19,6) | Net amount                                |
| vatamount             | numeric(19,6) | VAT portion                               |
| totalamount           | numeric(19,6) | Gross amount (net + VAT)                  |
| accountcode / vatcode | text          | ERP posting codes                         |

### "api_BOLT_header" — one row per Bolt invoice

Same shape as Wolt with these differences:

- Store name column is `bolt_storename` (there is **no** `partnername`).
- Extra columns: `scenario` (int), `je1_date`, `je2_date` (journal-entry
  dates), `erpcomments`.

### "api_BOLT_lines" — Bolt invoice line items

PK `(documentid, je_number, linenumber)` — note the extra `je_number` (which
journal entry the line belongs to). Otherwise same columns as Wolt lines.

## Semantics

- All monetary values are EUR.
- `totalpayout` on the header is the invoice-level net payout; line
  `totalamount` values broken down by `transtype` are the per-category view
  (see "Transaction types" for how they reconcile).
- `erpsent = 'Y'` means the invoice has been transferred to the ERP;
  `'N'` means still pending. Treat NULL as pending.
- `documentdate` is the business date to use for time filters and trends;
  `createdat` is only the import timestamp. `documentdate` is nullable —
  exclude NULLs from date bucketing.
- `project` is the project code that links a store to a brand (via the
  app's brand → project-code mapping). Per-brand questions usually become
  `WHERE project IN (...)` filters; if you only have a brand name, ask the
  user for project codes or aggregate per `project` instead.

## Transaction types (`transtype`)

Codes observed in the data (2026-10-16). Filter with an exact match
(`l.transtype = 'MKT'`), never with `ILIKE` on `linedetails`.

| Code    | Meaning                                                     | Wolt | Bolt | Typical `linedetails`                                                                                          |
| ------- | ----------------------------------------------------------- | ---- | ---- | -------------------------------------------------------------------------------------------------------------- |
| SAL     | Sales — gross value of goods sold                           | yes  | yes  | "Total, goods sold" / "Bolt/Total sales"                                                                       |
| COM     | Commission / agency fees kept by the aggregator             | yes  | yes  | "Commission, delivery 14.00%", "Transaction flat fee", "Venue lateness" / "Bolt/Weekly aggregate agency fees…" |
| COM_RED | Commission reduction — campaign agency-fee credit           | no   | yes  | "Bolt/Agency fee reduction for Campaigns", "Bolt/Adjustments: Refund"                                          |
| MKT     | Marketing spend — ad campaigns, sponsored listings, banners | yes  | yes  | "Ad campaign - Attributed purchases…", "Display Banner…" / "Bolt/Campaign fee", "Bolt/Sponsored Listing cost"  |
| MKT_DEL | Marketing costs for delivery (part of marketing spend)      | no   | yes  | "Bolt/Marketing costs for Delivery"                                                                            |
| DED     | Deductions                                                  | yes  | no   | "Deductions"                                                                                                   |
| ADD     | Additions / purchase corrections                            | yes  | no   | "Additions", "Purchase correction: Additions"                                                                  |
| DIS     | Discounts funded by the merchant                            | yes  | no   | "Total, items discounted by merchant"                                                                          |
| ELE     | Electronics — tablet / device charges                       | yes  | no   | "iPad … Tablet: …"                                                                                             |

Wording → codes:

- marketing spend / marketing cost / ad spend / campaign cost / sponsored
  listings → Wolt `MKT`; Bolt `MKT` + `MKT_DEL`. State that delivery
  marketing is included for Bolt; split it if asked. The code is `MKT`; treat
  `MTK` as a typo for `MKT` and answer directly.
- commission / agency fees / "what the aggregator keeps" → `COM`. Bolt net
  commission = `COM` − `COM_RED`; say which one you report.
- sales / revenue / gross sales / GMV → `SAL`.
- deductions → `DED`; additions → `ADD`; discounts → `DIS`; tablet or device
  charges → `ELE`. All Wolt-only — say so when asked about Bolt.
- A code not in this table → `SELECT DISTINCT transtype` first, then ask.

Sign conventions (checked against header `totalpayout`, `totalamount`
based):

- Bolt stores every line as a positive magnitude. For 3,996 of 3,998
  invoices: `totalpayout = SAL − COM + COM_RED − MKT − MKT_DEL`.
- Wolt stores `SAL`, `COM`, `MKT` positive, `DED` and `DIS` negative, `ADD`
  and `ELE` with either sign. For ~91% of invoices:
  `totalpayout = SAL + DIS + DED + ADD + ELE − COM − MKT`; the rest differ
  by more than 5 cents (cause not established — do not promise exact
  reconciliation).
- Wolt `MKT` contains a small number of negative lines (credits); a plain
  `sum()` is still the right net spend.
- `totalamount` is gross (incl. VAT) and is what reconciles to the payout;
  `amount` is net of VAT. Default to `totalamount` and label it "incl.
  VAT"; use `amount` for net / ex-VAT questions.
- Present costs (`COM`, `MKT`, `MKT_DEL`) as positive spend; present Wolt
  `DED` / `DIS` as `abs()` magnitudes labelled as deductions / discounts.

## Query patterns

Marketing spend for a period, both aggregators (gross, incl. VAT):

```sql
SELECT 'wolt' AS aggregator,
       count(*) AS line_items,
       coalesce(sum(l.totalamount), 0) AS marketing_spend
FROM "api_WOLT_lines" l
JOIN "api_WOLT_header" h ON h.documentid = l.documentid
WHERE l.transtype = 'MKT'
  AND h.documentdate >= date_trunc('month', CURRENT_DATE)
  AND h.documentdate <  date_trunc('month', CURRENT_DATE) + interval '1 month'
UNION ALL
SELECT 'bolt', count(*), coalesce(sum(l.totalamount), 0)
FROM "api_BOLT_lines" l
JOIN "api_BOLT_header" h ON h.documentid = l.documentid
WHERE l.transtype IN ('MKT', 'MKT_DEL')
  AND h.documentdate >= date_trunc('month', CURRENT_DATE)
  AND h.documentdate <  date_trunc('month', CURRENT_DATE) + interval '1 month'
```

Marketing spend per store (Wolt; swap `partnername` for `bolt_storename` and
the IN-list for Bolt):

```sql
SELECT coalesce(h.partnername, h.bpname) AS store,
       coalesce(sum(l.totalamount), 0) AS marketing_spend
FROM "api_WOLT_lines" l
JOIN "api_WOLT_header" h ON h.documentid = l.documentid
WHERE l.transtype = 'MKT'
  AND h.documentdate >= CURRENT_DATE - interval '90 days'
GROUP BY 1
ORDER BY marketing_spend DESC NULLS LAST
LIMIT 20
```

Marketing spend as a share of sales, per month (Bolt):

```sql
SELECT to_char(date_trunc('month', h.documentdate), 'YYYY-MM') AS month,
       sum(CASE WHEN l.transtype = 'SAL' THEN l.totalamount ELSE 0 END) AS sales,
       sum(CASE WHEN l.transtype IN ('MKT', 'MKT_DEL') THEN l.totalamount ELSE 0 END) AS marketing_spend,
       round(100.0 * sum(CASE WHEN l.transtype IN ('MKT', 'MKT_DEL') THEN l.totalamount ELSE 0 END)
             / nullif(sum(CASE WHEN l.transtype = 'SAL' THEN l.totalamount ELSE 0 END), 0), 2) AS marketing_pct_of_sales
FROM "api_BOLT_lines" l
JOIN "api_BOLT_header" h ON h.documentid = l.documentid
WHERE h.documentdate IS NOT NULL
GROUP BY 1
ORDER BY 1
```

Net commission on Bolt (fees minus campaign fee reductions):

```sql
SELECT sum(CASE WHEN l.transtype = 'COM' THEN l.totalamount ELSE 0 END) AS commission,
       sum(CASE WHEN l.transtype = 'COM_RED' THEN l.totalamount ELSE 0 END) AS commission_reduction,
       sum(CASE WHEN l.transtype = 'COM' THEN l.totalamount ELSE 0 END)
     - sum(CASE WHEN l.transtype = 'COM_RED' THEN l.totalamount ELSE 0 END) AS net_commission
FROM "api_BOLT_lines" l
JOIN "api_BOLT_header" h ON h.documentid = l.documentid
WHERE h.documentdate >= CURRENT_DATE - interval '30 days'
```

Per-aggregator totals for a period:

```sql
SELECT count(*) AS invoices, sum(totalpayout) AS total_payout
FROM "api_WOLT_header"
WHERE documentdate >= date_trunc('month', CURRENT_DATE)
  AND documentdate < date_trunc('month', CURRENT_DATE) + interval '1 month'
```

Breakdown by transaction type (join lines to header for date filters):

```sql
SELECT l.transtype, count(*) AS line_items, sum(l.totalamount) AS total
FROM "api_WOLT_lines" l
JOIN "api_WOLT_header" h ON h.documentid = l.documentid
WHERE h.documentdate >= CURRENT_DATE - interval '30 days'
GROUP BY l.transtype
ORDER BY total DESC
```

Top stores by payout (Wolt uses partnername, Bolt uses bolt_storename):

```sql
SELECT coalesce(partnername, bpname) AS store,
       count(*) AS invoices,
       sum(totalpayout) AS total_payout
FROM "api_WOLT_header"
GROUP BY 1
ORDER BY total_payout DESC NULLS LAST
LIMIT 20
```

Combined Wolt + Bolt view via UNION ALL:

```sql
SELECT 'wolt' AS aggregator, documentid, documentdate, totalpayout,
       coalesce(partnername, bpname) AS store, project, erpsent
FROM "api_WOLT_header"
UNION ALL
SELECT 'bolt', documentid, documentdate, totalpayout,
       coalesce(bolt_storename, bpname), project, erpsent
FROM "api_BOLT_header"
```

Monthly trend:

```sql
SELECT to_char(date_trunc('month', documentdate), 'YYYY-MM') AS month,
       count(*) AS invoices,
       sum(totalpayout) AS total_payout
FROM "api_BOLT_header"
WHERE documentdate IS NOT NULL
GROUP BY 1
ORDER BY 1
```

## Gotchas

- Always double-quote the table names (mixed case).
- The tool caps results at 200 rows — aggregate instead of listing.
- Case-insensitive text search: `ILIKE '%term%'`.
- `sum()` over no rows returns NULL — wrap with `coalesce(sum(x), 0)` when a
  zero matters.
