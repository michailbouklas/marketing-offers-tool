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
| transtype             | text          | Transaction type/category of the line     |
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
  `totalamount` values broken down by `transtype` are the per-category view.
- `erpsent = 'Y'` means the invoice has been transferred to the ERP;
  `'N'` means still pending. Treat NULL as pending.
- `documentdate` is the business date to use for time filters and trends;
  `createdat` is only the import timestamp. `documentdate` is nullable —
  exclude NULLs from date bucketing.
- `project` is the project code that links a store to a brand (via the
  app's brand → project-code mapping). Per-brand questions usually become
  `WHERE project IN (...)` filters; if you only have a brand name, ask the
  user for project codes or aggregate per `project` instead.

## Query patterns

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
