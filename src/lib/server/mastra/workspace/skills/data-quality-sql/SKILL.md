---
name: data-quality-sql
description: Full schema reference and proven SQL query patterns for the offers data-quality PostgreSQL tables (the pricing-gap queue, staged pricing submissions and their approval state, and the channel/category/subcategory lookups).
---

# Offers data-quality SQL (PostgreSQL)

PostgreSQL database (the app's `public` schema). Table names are lower-case
and do NOT need quoting. This database holds the **workflow** side of the
data-quality module: which items have missing pricing (the gap queue), what
values users have submitted for review, and the lookup lists the entry form
offers. The **actual current pricing values** live in ClickHouse `dim_offers`
— use the `dim-offers-sql` skill / `query-dim-offers-sql` tool for those.

## Tables

### dq_missing_offers_pricing — the pricing-gap queue

One row per detected gap (an offer item missing pricing data).

| Column         | Type      | Notes                                                                 |
| -------------- | --------- | --------------------------------------------------------------------- |
| dq_id          | int       | Primary key                                                           |
| trde_item      | varchar   | Item code (joins to ClickHouse `dim_offers.item_code`)                |
| item_name      | varchar   | Item description                                                      |
| brand          | varchar   | Brand of the item — use for per-brand questions                       |
| item_category  | varchar   | Transaction/item category the gap was detected under                  |
| missing_fields | varchar   | Comma-separated list, values from {ideal_price,selling_price,fc_perc} |
| detected_at    | timestamp | When the gap was first detected                                       |
| status         | enum      | `open`, `submitted`, or `resolved`                                    |
| resolved_at    | timestamp | Set when status becomes `resolved` (nullable)                         |

### dim_offers_staging — submitted pricing values awaiting/past review

| Column        | Type          | Notes                                           |
| ------------- | ------------- | ----------------------------------------------- |
| id            | int           | Primary key                                     |
| dq_id         | int           | FK → dq_missing_offers_pricing.dq_id            |
| item_code     | varchar       | Item code (same as the gap's trde_item)         |
| channel       | varchar       | Selected sales channel                          |
| category      | varchar       | Selected pricing category                       |
| subcategory   | varchar       | Selected pricing subcategory                    |
| ideal_price   | numeric(10,2) | Submitted ideal price, EUR                      |
| selling_price | numeric(10,2) | Submitted selling price, EUR                    |
| fc_perc       | numeric(5,4)  | Food-cost **fraction** (0–1, e.g. 0.3200 = 32%) |
| mktg_spend    | numeric(10,2) | Marketing spend, EUR (nullable)                 |
| notes         | varchar(500)  | Free-text notes (nullable)                      |
| submitted_by  | varchar       | User id who submitted                           |
| submitted_at  | timestamp     | When submitted                                  |
| approved_by   | varchar       | User id who approved (nullable)                 |
| approved_at   | timestamp     | When approved (nullable)                        |
| status        | enum          | `pending`, `approved`, or `rejected`            |

### dim_offers_audit — audit log of approved dim_offers writes

| Column         | Type      | Notes                                           |
| -------------- | --------- | ----------------------------------------------- |
| id             | int       | Primary key                                     |
| item_code      | varchar   | Affected item                                   |
| action         | enum      | `insert` or `update`                            |
| source         | enum      | `gap_approval`                                  |
| changed_by     | varchar   | User id who triggered the write                 |
| changed_at     | timestamp | When the write happened                         |
| staging_id     | int       | FK → dim_offers_staging.id (nullable)           |
| dq_id          | int       | FK → dq_missing_offers_pricing.dq_id (nullable) |
| before_values  | jsonb     | Snapshot before the write (nullable)            |
| after_values   | jsonb     | Snapshot after the write                        |
| changed_fields | text[]    | Names of the fields that changed                |

### Lookups: channels, categories, subcategories

- `channels(id, name)` — available sales channels.
- `categories(id, name)` — pricing categories.
- `subcategories(id, category_id, name)` — subcategories; `category_id` FKs to
  `categories.id`.

## Semantics

- `dq_missing_offers_pricing.status`: `open` = not yet actioned,
  `submitted` = a value is staged for approval, `resolved` = closed.
- `dim_offers_staging.status`: `pending` = awaiting approval,
  `approved`/`rejected` = decided. The submission backlog = pending rows.
- `fc_perc` here is a fraction 0–1; multiply by 100 to present a percentage.
- Money columns are EUR.
- Per-brand questions filter on `dq_missing_offers_pricing.brand`. Brand values
  correspond to the app's brand aliases (case-insensitive).

## Query patterns

Gap queue counts by status:

```sql
SELECT status, count(*) AS gaps
FROM dq_missing_offers_pricing
GROUP BY status
ORDER BY gaps DESC
```

Open gaps by brand:

```sql
SELECT brand, count(*) AS open_gaps
FROM dq_missing_offers_pricing
WHERE status = 'open'
GROUP BY brand
ORDER BY open_gaps DESC
```

Which fields are most often missing (missing_fields is comma-separated):

```sql
SELECT trim(field) AS missing_field, count(*) AS occurrences
FROM dq_missing_offers_pricing,
     LATERAL unnest(string_to_array(missing_fields, ',')) AS field
WHERE status = 'open'
GROUP BY 1
ORDER BY occurrences DESC
```

Submission backlog (pending review):

```sql
SELECT count(*) AS pending_submissions
FROM dim_offers_staging
WHERE status = 'pending'
```

Recently approved submissions with their gap context:

```sql
SELECT s.item_code, s.approved_at, s.approved_by,
       g.brand, g.item_name
FROM dim_offers_staging s
JOIN dq_missing_offers_pricing g ON g.dq_id = s.dq_id
WHERE s.status = 'approved'
ORDER BY s.approved_at DESC NULLS LAST
```

Categories with their subcategories:

```sql
SELECT c.name AS category, s.name AS subcategory
FROM categories c
JOIN subcategories s ON s.category_id = c.id
ORDER BY c.name, s.name
```

## Gotchas

- The tool caps results at 200 rows — aggregate instead of listing.
- Case-insensitive text search: `ILIKE '%term%'`.
- `sum()` over no rows returns NULL — wrap with `coalesce(sum(x), 0)` when a
  zero matters.
- Current, live pricing (ideal/selling price actually in effect) is NOT here —
  it is in ClickHouse `dim_offers`. Use the `query-dim-offers-sql` tool for it.
