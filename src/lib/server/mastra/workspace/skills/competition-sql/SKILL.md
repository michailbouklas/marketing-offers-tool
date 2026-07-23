---
name: competition-sql
description: Full schema reference and proven ClickHouse query patterns for the aggregator-scraper replica (competitor restaurants, menus, prices, offers, offer history, scrape sessions).
---

# Competition SQL

ClickHouse database (aggregator-scraper replica). Use unqualified table
names — the tool's connection already selects the replica database.

Every table is `ReplacingMergeTree(_version)`: you MUST append `FINAL` after
the table alias (`FROM offer AS o FINAL` — ClickHouse rejects `FINAL` before
`AS`) or results include duplicate row versions and counts inflate.
`_sign` / `_version` are MATERIALIZED columns and never appear in `SELECT *`.

## Tables

### aggregator — delivery platforms (Wolt, Foody, …)

The UI calls these "processors" — treat aggregator/processor/platform as
synonyms. Display name: `coalesce(nullIf(a.display_name, ''), a.name)`.

| Column       | Type              | Notes                   |
| ------------ | ----------------- | ----------------------- |
| id           | Int32             | Primary key             |
| name         | String            | Internal name           |
| display_name | String            | May be empty — coalesce |
| base_domain  | String            |                         |
| rating_scale | Nullable(Float64) | e.g. 5 or 10            |

### restaurant — one row per restaurant PER aggregator

The same real-world restaurant appears once per aggregator it is listed on.

| Column               | Type              | Notes                  |
| -------------------- | ----------------- | ---------------------- |
| id                   | Int32             | Primary key            |
| aggregator_id        | Int32             | → aggregator.id        |
| name                 | String            |                        |
| slug                 | String            |                        |
| source_url           | String            | Listing page URL       |
| provider_external_id | Nullable(String)  |                        |
| page_title           | Nullable(String)  |                        |
| rating_value         | Nullable(Float64) | On rating_scale        |
| rating_count         | Nullable(Int32)   |                        |
| rating_scale         | Nullable(Float64) |                        |
| delivery_info        | Nullable(String)  | Free text (fee / time) |
| minimum_order        | Nullable(Float64) | EUR                    |

### offer — current state of each detected offer

| Column        | Type             | Notes                                                     |
| ------------- | ---------------- | --------------------------------------------------------- |
| id            | Int32            | Primary key                                               |
| restaurant_id | Int32            | → restaurant.id                                           |
| product_id    | Nullable(Int32)  | → product.id (offers without a matched product have NULL) |
| title         | String           |                                                           |
| description   | Nullable(String) |                                                           |
| first_seen_at | DateTime64(6)    | First scrape that saw the offer                           |
| last_seen_at  | DateTime64(6)    | Most recent scrape that saw it                            |
| is_active     | UInt8            | 1 = currently running                                     |

### offer_snapshot — per-scrape offer history (the biggest table)

Use for "when did X change" / trend questions; `offer` only holds the
current state. Always scope joins/filters (by offer, restaurant, or
`ORDER BY recorded_at DESC LIMIT n`) — unscoped scans can hit the 15 s
timeout.

| Column      | Type            | Notes                          |
| ----------- | --------------- | ------------------------------ |
| id          | Int32           | Primary key                    |
| offer_id    | Int32           | → offer.id                     |
| product_id  | Nullable(Int32) | → product.id                   |
| session_id  | Int32           | → scrape_session.id            |
| title       | String          |                                |
| is_active   | UInt8           | Status observed at that scrape |
| recorded_at | DateTime64(6)   | When the scrape observed it    |

### product — menu items

| Column        | Type             | Notes                    |
| ------------- | ---------------- | ------------------------ |
| id            | Int32            | Primary key              |
| restaurant_id | Int32            | → restaurant.id          |
| category_id   | Int32            | → restaurant_category.id |
| title         | String           |                          |
| description   | Nullable(String) |                          |
| is_offer      | UInt8            | Item is offer-flagged    |
| first_seen_at | DateTime64(6)    |                          |
| last_seen_at  | DateTime64(6)    |                          |

### product_price — price time-series (the ONLY place prices live)

| Column      | Type              | Notes                           |
| ----------- | ----------------- | ------------------------------- |
| id          | Int32             | Primary key                     |
| product_id  | Int32             | → product.id                    |
| session_id  | Int32             | → scrape_session.id             |
| price       | Nullable(Float64) | Frequently NULL — see Semantics |
| recorded_at | DateTime64(6)     |                                 |

### restaurant_category — menu sections

| Column            | Type   | Notes                 |
| ----------------- | ------ | --------------------- |
| id                | Int32  | Primary key           |
| restaurant_id     | Int32  | → restaurant.id       |
| name              | String |                       |
| item_count        | Int32  |                       |
| is_offer_category | UInt8  | Category holds offers |

### scrape_session — scrape runs (data freshness)

| Column         | Type             | Notes                                                               |
| -------------- | ---------------- | ------------------------------------------------------------------- |
| id             | Int32            | Primary key                                                         |
| restaurant_id  | Nullable(Int32)  | NULL for aggregator-wide runs                                       |
| aggregator_id  | Int32            | → aggregator.id                                                     |
| language       | String           | en / el                                                             |
| scraped_at     | DateTime64(6)    |                                                                     |
| category_count | Int32            |                                                                     |
| item_count     | Int32            |                                                                     |
| offer_count    | Int32            |                                                                     |
| status         | String           | Free-form — inspect `SELECT DISTINCT status` before filtering on it |
| error_message  | Nullable(String) |                                                                     |

### Do NOT query

`canonical_category`, `canonical_product`, `category_mapping`,
`product_mapping`, `merged_restaurant`, `merged_restaurant_link`,
`product_badge` — entity-resolution / scratch tables the app itself never
reads; joining through them produces misleading results.

## Semantics

- **Latest known price per product** (the load-bearing idiom — prices exist
  only in the `product_price` time-series, and the most recent reading is
  frequently NULL, especially for offer/promo products):

  ```sql
  SELECT product_id, argMaxIf(price, recorded_at, price IS NOT NULL) AS price
  FROM product_price FINAL
  GROUP BY product_id
  ```

  Always scope it (`WHERE product_id IN (SELECT id FROM product FINAL WHERE
restaurant_id = …)`) so the aggregation stays bounded. It yields NULL only
  when the product has never carried a price — report that as "no known
  price", never 0.

- **Point-in-time price for a snapshot** joins on BOTH keys:
  `pp.product_id = os.product_id AND pp.session_id = os.session_id`.
- No currency is stored anywhere — prices are EUR.
- `DateTime64(6)` columns are UTC wall-clock. Render with
  `formatDateTime(col, '%Y-%m-%dT%H:%i:%SZ')` (`%i` is minutes — `%M` is the
  month name). Parse ISO bounds with
  `parseDateTime64BestEffort('2026-07-01T00:00:00Z', 6)` (`from` inclusive,
  `to` exclusive).
- Scraping is periodic: anchor relative windows to the data
  (`SELECT max(scraped_at) FROM scrape_session FINAL`), not `now()`.
- Case-insensitive name search: `positionCaseInsensitiveUTF8(r.name, 'term') > 0`.

## Query patterns

Overall totals:

```sql
SELECT
  (SELECT count() FROM restaurant FINAL) AS total_restaurants,
  (SELECT count() FROM product FINAL) AS total_products,
  (SELECT count() FROM offer FINAL) AS total_offers,
  (SELECT count() FROM offer FINAL WHERE is_active = 1) AS active_offers
```

Active offers + restaurants running them, per aggregator:

```sql
SELECT
  any(coalesce(nullIf(a.display_name, ''), a.name)) AS aggregator_name,
  count() AS active_offers,
  uniqExact(o.restaurant_id) AS restaurants_with_offers
FROM offer AS o FINAL
INNER JOIN restaurant AS r FINAL ON r.id = o.restaurant_id
LEFT JOIN aggregator AS a FINAL ON a.id = r.aggregator_id
WHERE o.is_active = 1
GROUP BY r.aggregator_id
ORDER BY active_offers DESC
```

Recent offer changes (activations / deactivations), with the price observed
at that scrape:

```sql
SELECT
  o.title AS offer_name,
  r.name AS restaurant_name,
  coalesce(nullIf(a.display_name, ''), a.name) AS aggregator_name,
  if(os.is_active = 1, 'active', 'inactive') AS became,
  pp.price AS price,
  formatDateTime(os.recorded_at, '%Y-%m-%dT%H:%i:%SZ') AS recorded_at
FROM offer_snapshot AS os FINAL
LEFT JOIN offer AS o FINAL ON o.id = os.offer_id
LEFT JOIN restaurant AS r FINAL ON r.id = o.restaurant_id
LEFT JOIN aggregator AS a FINAL ON a.id = r.aggregator_id
LEFT JOIN product_price AS pp FINAL
  ON pp.product_id = os.product_id AND pp.session_id = os.session_id
ORDER BY os.recorded_at DESC
LIMIT 20
```

Find a restaurant by name (do this first when the user names a restaurant —
remember the same restaurant exists once per aggregator):

```sql
SELECT r.id, r.name,
       coalesce(nullIf(a.display_name, ''), a.name) AS aggregator_name,
       r.rating_value, r.rating_count
FROM restaurant AS r FINAL
LEFT JOIN aggregator AS a FINAL ON a.id = r.aggregator_id
WHERE positionCaseInsensitiveUTF8(r.name, 'search term') > 0
ORDER BY r.name ASC
LIMIT 20
```

Active offers of one restaurant with latest known prices:

```sql
SELECT o.title, o.description, pp.price,
       formatDateTime(o.first_seen_at, '%Y-%m-%dT%H:%i:%SZ') AS first_seen
FROM offer AS o FINAL
LEFT JOIN (
  SELECT product_id, argMaxIf(price, recorded_at, price IS NOT NULL) AS price
  FROM product_price FINAL
  WHERE product_id IN (SELECT id FROM product FINAL WHERE restaurant_id = 123)
  GROUP BY product_id
) AS pp ON pp.product_id = o.product_id
WHERE o.restaurant_id = 123 AND o.is_active = 1
ORDER BY o.title ASC
```

Restaurant menu grouped by category with prices:

```sql
SELECT ifNull(c.name, 'Uncategorized') AS category,
       pr.title AS product,
       pp.price AS price,
       pr.is_offer AS is_offer
FROM product AS pr FINAL
LEFT JOIN restaurant_category AS c FINAL ON c.id = pr.category_id
LEFT JOIN (
  SELECT product_id, argMaxIf(price, recorded_at, price IS NOT NULL) AS price
  FROM product_price FINAL
  WHERE product_id IN (SELECT id FROM product FINAL WHERE restaurant_id = 123)
  GROUP BY product_id
) AS pp ON pp.product_id = pr.id
WHERE pr.restaurant_id = 123
ORDER BY category ASC, pr.title ASC
```

Active offers per day per aggregator (trend). An offer counts as active on a
day when it was first seen on or before that day and either is still active
or was last seen on or after it. The day spine is generated inline — adjust
the two literal dates to the requested window:

```sql
SELECT
  toString(days.day) AS day,
  any(coalesce(nullIf(a.display_name, ''), a.name)) AS aggregator_name,
  count() AS active_offers
FROM offer AS o FINAL
CROSS JOIN (
  WITH toDate('2026-06-08') AS start_day, toDate('2026-07-22') AS end_day
  SELECT arrayJoin(arrayMap(i -> start_day + i, range(dateDiff('day', start_day, end_day) + 1))) AS day
) AS days
INNER JOIN restaurant AS r FINAL ON r.id = o.restaurant_id
LEFT JOIN aggregator AS a FINAL ON a.id = r.aggregator_id
WHERE toDate(o.first_seen_at) <= days.day
  AND (o.is_active = 1 OR toDate(o.last_seen_at) >= days.day)
GROUP BY days.day, r.aggregator_id
ORDER BY days.day ASC, aggregator_name ASC
```

Top restaurants by active offer count:

```sql
SELECT r.name AS restaurant_name,
       coalesce(nullIf(a.display_name, ''), a.name) AS aggregator_name,
       count() AS active_offers
FROM offer AS o FINAL
INNER JOIN restaurant AS r FINAL ON r.id = o.restaurant_id
LEFT JOIN aggregator AS a FINAL ON a.id = r.aggregator_id
WHERE o.is_active = 1
GROUP BY o.restaurant_id, r.name, aggregator_name
ORDER BY active_offers DESC
LIMIT 20
```

Data freshness (latest scrape overall / per aggregator):

```sql
SELECT
  any(coalesce(nullIf(a.display_name, ''), a.name)) AS aggregator_name,
  formatDateTime(max(s.scraped_at), '%Y-%m-%dT%H:%i:%SZ') AS last_scraped,
  count() AS sessions
FROM scrape_session AS s FINAL
LEFT JOIN aggregator AS a FINAL ON a.id = s.aggregator_id
GROUP BY s.aggregator_id
```

## Gotchas

- Forgetting `FINAL` is the #1 error: counts silently inflate. Every table
  reference needs it, including subqueries and joined tables.
- The tool caps results at 200 rows — aggregate instead of listing.
- `avg()` / `sum()` over zero rows return NULL (or NaN) — wrap with
  `ifNull(...)` when a zero matters.
- Numeric aggregates arrive as strings in raw JSON; the tool converts them
  to numbers for you based on the column type.
- Do NOT alias columns or subqueries to bare reserved-looking words such as
  `url`, `file`, `set`, `delete`, `update`, `move`, `system` — the tool's
  keyword filter rejects them as standalone words. Underscored names like
  `source_url` or `updated_at` are fine.
- `offer.product_id` is nullable: offers without a matched product can never
  be joined to a price.
- `count(DISTINCT x)` is fine; so is `uniqExact(x)`.
