import { clickhouse } from "$lib/server/clickhouse";
import {
  googleReviewsTable,
  parseCount,
  parseNullableNumber,
} from "$lib/server/google-reviews-db";
import type {
  GoogleReviewsDashboardStats,
  SentimentBucket,
  StarBucket,
  TimeseriesPoint,
  TopBusinessRow,
} from "$lib/services/google-reviews/google-reviews";

type TotalsRow = {
  total_businesses: string | number;
  total_reviews: string | number;
  avg_rating?: string | number | null;
  negative_count: string | number;
  sentiment_total: string | number;
};

type TimeseriesRow = {
  day: string;
  value: string | number;
};

type StarDistributionRow = {
  s1: string | number;
  s2: string | number;
  s3: string | number;
  s4: string | number;
  s5: string | number;
};

type SentimentDistributionRow = {
  positive: string | number;
  neutral: string | number;
  negative: string | number;
};

type TopBusinessQueryRow = {
  cid: string;
  title: string;
  average_rating?: string | number | null;
  review_count?: string | number | null;
};

const TOP_BUSINESSES_LIMIT = 20;

/**
 * Trailing window for the dashboard timeseries charts. Anchored to the latest
 * `review_date` in the replica (not `now()`): the scraper pipeline lags real
 * time, so a `now()`-relative window can fall entirely past the available data
 * and collapse the timeseries to a couple of stray points.
 */
const TIMESERIES_WINDOW_DAYS = 45;

export async function getDashboardStats(): Promise<GoogleReviewsDashboardStats> {
  const [
    totalsRows,
    reviewsPerDayRows,
    avgRatingPerDayRows,
    starRows,
    sentimentRows,
    topBusinessRows,
  ] = await Promise.all([
    clickhouse
      .query({
        query: `
          SELECT
            (SELECT count() FROM ${googleReviewsTable("businesses")} FINAL) AS total_businesses,
            (
              SELECT sum(ifNull(review_count, 0))
              FROM ${googleReviewsTable("review_summaries")} FINAL
            ) AS total_reviews,
            (
              SELECT avg(average_rating)
              FROM ${googleReviewsTable("review_summaries")} FINAL
              WHERE average_rating IS NOT NULL
            ) AS avg_rating,
            (
              SELECT sum(ifNull(negative_count, 0))
              FROM ${googleReviewsTable("review_summaries")} FINAL
            ) AS negative_count,
            (
              SELECT
                sum(ifNull(positive_count, 0))
                + sum(ifNull(neutral_count, 0))
                + sum(ifNull(negative_count, 0))
              FROM ${googleReviewsTable("review_summaries")} FINAL
            ) AS sentiment_total
        `,
        format: "JSONEachRow",
      })
      .then((result) => result.json<TotalsRow>()),
    clickhouse
      .query({
        query: `
          SELECT toString(toDate(r.review_date)) AS day, count() AS value
          FROM ${googleReviewsTable("reviews")} AS r FINAL
          WHERE r.review_date IS NOT NULL
            AND r.review_date >= (
              SELECT max(review_date)
              FROM ${googleReviewsTable("reviews")} FINAL
              WHERE review_date IS NOT NULL
            ) - INTERVAL {window_days:UInt32} DAY
          GROUP BY day
          ORDER BY day ASC
        `,
        query_params: { window_days: TIMESERIES_WINDOW_DAYS },
        format: "JSONEachRow",
      })
      .then((result) => result.json<TimeseriesRow>()),
    clickhouse
      .query({
        query: `
          SELECT toString(toDate(r.review_date)) AS day, avg(r.rating) AS value
          FROM ${googleReviewsTable("reviews")} AS r FINAL
          WHERE r.review_date IS NOT NULL
            AND r.review_date >= (
              SELECT max(review_date)
              FROM ${googleReviewsTable("reviews")} FINAL
              WHERE review_date IS NOT NULL
            ) - INTERVAL {window_days:UInt32} DAY
          GROUP BY day
          ORDER BY day ASC
        `,
        query_params: { window_days: TIMESERIES_WINDOW_DAYS },
        format: "JSONEachRow",
      })
      .then((result) => result.json<TimeseriesRow>()),
    clickhouse
      .query({
        query: `
          SELECT
            sum(ifNull(rating_1_count, 0)) AS s1,
            sum(ifNull(rating_2_count, 0)) AS s2,
            sum(ifNull(rating_3_count, 0)) AS s3,
            sum(ifNull(rating_4_count, 0)) AS s4,
            sum(ifNull(rating_5_count, 0)) AS s5
          FROM ${googleReviewsTable("review_summaries")} FINAL
        `,
        format: "JSONEachRow",
      })
      .then((result) => result.json<StarDistributionRow>()),
    clickhouse
      .query({
        query: `
          SELECT
            sum(ifNull(positive_count, 0)) AS positive,
            sum(ifNull(neutral_count, 0)) AS neutral,
            sum(ifNull(negative_count, 0)) AS negative
          FROM ${googleReviewsTable("review_summaries")} FINAL
        `,
        format: "JSONEachRow",
      })
      .then((result) => result.json<SentimentDistributionRow>()),
    clickhouse
      .query({
        query: `
          SELECT
            b.cid AS cid,
            b.title AS title,
            rs.average_rating AS average_rating,
            rs.review_count AS review_count
          FROM ${googleReviewsTable("review_summaries")} AS rs FINAL
          INNER JOIN ${googleReviewsTable("businesses")} AS b FINAL
            ON b.cid = rs.business_cid
          WHERE rs.average_rating IS NOT NULL
          ORDER BY rs.average_rating DESC, rs.review_count DESC
          LIMIT {limit:UInt32}
        `,
        query_params: { limit: TOP_BUSINESSES_LIMIT },
        format: "JSONEachRow",
      })
      .then((result) => result.json<TopBusinessQueryRow>()),
  ]);

  const totalsRow = totalsRows[0];
  const negativeCount = parseCount(totalsRow?.negative_count);
  const sentimentTotal = parseCount(totalsRow?.sentiment_total);
  const totals = {
    businesses: parseCount(totalsRow?.total_businesses),
    reviews: parseCount(totalsRow?.total_reviews),
    averageRating: parseNullableNumber(totalsRow?.avg_rating),
    negativeCount,
    negativePercentage:
      sentimentTotal > 0 ? (negativeCount / sentimentTotal) * 100 : null,
  };

  const mapTimeseries = (rows: TimeseriesRow[]) =>
    rows.map<TimeseriesPoint>((row) => ({
      day: row.day,
      value: parseNullableNumber(row.value) ?? 0,
    }));

  const starRow = starRows[0];
  const starDistribution: StarBucket[] = [
    { stars: 1, count: parseCount(starRow?.s1) },
    { stars: 2, count: parseCount(starRow?.s2) },
    { stars: 3, count: parseCount(starRow?.s3) },
    { stars: 4, count: parseCount(starRow?.s4) },
    { stars: 5, count: parseCount(starRow?.s5) },
  ];

  const sentimentRow = sentimentRows[0];
  const sentimentDistribution: SentimentBucket[] = [
    { sentiment: "positive", count: parseCount(sentimentRow?.positive) },
    { sentiment: "neutral", count: parseCount(sentimentRow?.neutral) },
    { sentiment: "negative", count: parseCount(sentimentRow?.negative) },
  ];

  const topBusinesses = topBusinessRows.map<TopBusinessRow>((row) => ({
    cid: row.cid,
    title: row.title,
    averageRating: parseNullableNumber(row.average_rating),
    reviewCount: parseCount(row.review_count),
  }));

  return {
    totals,
    reviewsPerDay: mapTimeseries(reviewsPerDayRows),
    avgRatingPerDay: mapTimeseries(avgRatingPerDayRows),
    starDistribution,
    sentimentDistribution,
    topBusinesses,
  };
}
