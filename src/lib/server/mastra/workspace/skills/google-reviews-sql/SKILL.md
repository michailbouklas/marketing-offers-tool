---
name: google-reviews-sql
description: Full schema reference and proven ClickHouse query patterns for the Google reviews replica (businesses, reviews, sentiment, AI review categories, per-business summaries).
---

# Google reviews SQL

ClickHouse database (google-maps-scraper replica). Use unqualified table
names — the tool's connection already selects the replica database.

Every table is `ReplacingMergeTree(_version)`: you MUST append `FINAL` after
the table alias (`FROM reviews AS r FINAL` — ClickHouse rejects `FINAL`
before `AS`) or results include duplicate row versions and counts inflate.
`_sign` / `_version` are MATERIALIZED columns and never appear in `SELECT *`.

## Tables

### businesses — one row per Google business

| Column       | Type    | Notes                                                                            |
| ------------ | ------- | -------------------------------------------------------------------------------- |
| cid          | String  | Primary key. 19-digit numeric-looking string — NEVER cast or compare as a number |
| title        | String  | Business (restaurant) name                                                       |
| category     | String  | Google business category                                                         |
| address      | String  |                                                                                  |
| phone        | String  |                                                                                  |
| website      | String  |                                                                                  |
| status       | String  | e.g. open / closed                                                               |
| description  | String  |                                                                                  |
| thumbnail    | String  | Image URL                                                                        |
| price_range  | String  |                                                                                  |
| latitude     | Float64 |                                                                                  |
| longitude    | Float64 |                                                                                  |
| reviews_link | String  |                                                                                  |

### reviews — one row per scraped review

| Column              | Type                    | Notes                                                                    |
| ------------------- | ----------------------- | ------------------------------------------------------------------------ |
| id                  | Int                     | Review id                                                                |
| business_cid        | String                  | → businesses.cid                                                         |
| reviewer_name       | String                  |                                                                          |
| rating              | UInt8                   | Stars 1–5                                                                |
| review_text         | Nullable(String)        | May be empty (rating-only reviews)                                       |
| review_date         | Nullable(DateTime64(6)) | Sparse AND lags real time — see Semantics                                |
| sentiment           | Nullable(String)        | positive / neutral / negative — casing varies, always compare lowercased |
| sentiment_certainty | Nullable(Float)         | Confidence of the sentiment label                                        |
| category_id         | Nullable(Int32)         | → review_categories.id (AI-derived review category)                      |

### review_summaries — per-business rollup

Keyed by `business_cid`. Prefer this table over scanning `reviews` for
per-business totals, averages, and star/sentiment distributions.

| Column                                          | Type               | Notes                  |
| ----------------------------------------------- | ------------------ | ---------------------- |
| business_cid                                    | String             | → businesses.cid       |
| review_count                                    | Nullable(Int)      |                        |
| average_rating                                  | Nullable(Float)    |                        |
| rating_1_count … rating_5_count                 | Nullable(Int)      | Star distribution      |
| positive_count / neutral_count / negative_count | Nullable(Int)      | Sentiment distribution |
| last_sentiment_analysis                         | Nullable(DateTime) |                        |

### review_categories — AI review category dictionary

| Column    | Type   | Notes                           |
| --------- | ------ | ------------------------------- |
| id        | Int32  | → reviews.category_id           |
| category  | String | Category label; filter out `''` |
| is_active | UInt8  | Treat NULL as active            |

### Smaller tables

- **business_features** — business_cid, feature_category, feature_name,
  is_enabled (0/1).
- **operating_hours** — business_cid, day_of_week, hours.
- **ordering_options** — business_cid, platform_name, order_url.
- **review_category_metrics_timeseries** — business_cid, category_id,
  review_count, percentage, snapshot_date. Snapshots accumulate — always pick
  the latest via `snapshot_date = (SELECT max(snapshot_date) FROM
review_category_metrics_timeseries FINAL WHERE business_cid = ...)`.

## Semantics

- `cid` / `business_cid` are Strings. `WHERE b.cid = '1234567890123456789'` —
  quoting is mandatory; numeric comparison silently matches nothing.
- Sentiment casing is not guaranteed: always `lower(r.sentiment) = 'negative'`
  (labels: positive, neutral, negative).
- `review_date` is nullable, sparse, and the scraper lags real time. Anchor
  relative windows to `(SELECT max(review_date) FROM reviews FINAL WHERE
review_date IS NOT NULL)` instead of `now()`, and always add
  `review_date IS NOT NULL` when bucketing by date.
- Category questions need `r.category_id IS NOT NULL` and `rc.category != ''`
  (uncategorized reviews and blank categories are common).
- For per-business totals/averages use `review_summaries`; scan `reviews`
  only when filtering by review-level fields (text, date, category, rating).

## Query patterns

Overall totals (from the rollup, not raw reviews):

```sql
SELECT
  (SELECT count() FROM businesses FINAL) AS total_businesses,
  (SELECT sum(ifNull(review_count, 0)) FROM review_summaries FINAL) AS total_reviews,
  (SELECT avg(average_rating) FROM review_summaries FINAL
   WHERE average_rating IS NOT NULL) AS avg_rating,
  (SELECT sum(ifNull(negative_count, 0)) FROM review_summaries FINAL) AS negative_reviews
```

Reviews per day over the last 45 days of available data (anchored to the
data, not the clock):

```sql
SELECT toString(toDate(r.review_date)) AS day, count() AS reviews
FROM reviews AS r FINAL
WHERE r.review_date IS NOT NULL
  AND r.review_date >= (
    SELECT max(review_date) FROM reviews FINAL WHERE review_date IS NOT NULL
  ) - INTERVAL 45 DAY
GROUP BY day
ORDER BY day ASC
```

Top / bottom businesses by rating (join rollup to names):

```sql
SELECT b.title, rs.average_rating, rs.review_count
FROM review_summaries AS rs FINAL
INNER JOIN businesses AS b FINAL ON b.cid = rs.business_cid
WHERE rs.average_rating IS NOT NULL
ORDER BY rs.average_rating DESC, rs.review_count DESC
LIMIT 20
```

Search reviews by business name (case-insensitive substring):

```sql
SELECT b.title, r.reviewer_name, r.rating, r.review_text
FROM reviews AS r FINAL
LEFT JOIN businesses AS b FINAL ON b.cid = r.business_cid
WHERE positionCaseInsensitiveUTF8(ifNull(b.title, ''), 'search term') > 0
ORDER BY ifNull(r.review_date, toDateTime64(0, 6)) DESC
LIMIT 50
```

Negative-review categories ranked (which problems hurt most):

```sql
SELECT rc.category,
       count(DISTINCT r.business_cid) AS businesses_affected,
       count() AS negative_reviews
FROM reviews AS r FINAL
INNER JOIN review_categories AS rc FINAL ON rc.id = r.category_id
WHERE lower(r.sentiment) = 'negative'
  AND r.category_id IS NOT NULL
  AND rc.category != ''
GROUP BY rc.category
ORDER BY negative_reviews DESC
```

Monthly rating + sentiment trend for one business:

```sql
SELECT toString(toStartOfMonth(r.review_date)) AS month,
       count() AS reviews,
       avg(r.rating) AS avg_rating,
       countIf(lower(r.sentiment) = 'positive') AS positive,
       countIf(lower(r.sentiment) = 'neutral') AS neutral,
       countIf(lower(r.sentiment) = 'negative') AS negative
FROM reviews AS r FINAL
WHERE r.business_cid = '1234567890123456789'
  AND r.review_date IS NOT NULL
GROUP BY month
ORDER BY month ASC
```

Date-range filter from ISO strings (`from` inclusive, `to` exclusive):

```sql
WHERE r.review_date >= parseDateTime64BestEffort('2026-06-01T00:00:00Z', 6)
  AND r.review_date <  parseDateTime64BestEffort('2026-07-01T00:00:00Z', 6)
```

Render a DateTime64 as a UTC ISO string (`%i` is minutes — `%M` is the month
name):

```sql
formatDateTime(r.review_date, '%Y-%m-%dT%H:%i:%SZ')
```

## Gotchas

- Forgetting `FINAL` is the #1 error: counts silently inflate. Every table
  reference needs it, including subqueries and joined tables.
- The tool caps results at 200 rows — aggregate instead of listing.
- `avg()` / `sum()` over zero rows return NULL (or NaN) — wrap with
  `ifNull(...)` when a zero matters.
- UInt64 counts arrive as strings in raw JSON; the tool converts them to
  numbers for you based on the column type.
- Case-insensitive search: `positionCaseInsensitiveUTF8(col, 'term') > 0`
  (matches the app's own behavior; `ILIKE` also works).
- `count(DISTINCT x)` is fine; so is `uniqExact(x)`.
