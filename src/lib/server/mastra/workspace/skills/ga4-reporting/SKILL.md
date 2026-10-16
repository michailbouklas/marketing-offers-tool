---
name: ga4-reporting
description: How to compose Google Analytics 4 Data API reports for the runGoogleAnalyticsReport tool — metric and dimension API names with their scope and meaning, compatibility rules, relative-date syntax, filter and orderBy shapes, two-range comparisons, the eleven proven dashboard request bodies, quota and data-freshness caveats, and a wording → fields map.
---

# GA4 reporting for the Google Analytics Assistant

Load this before any `runGoogleAnalyticsReport` call that is more than one
metric over one range, and whenever Google answers INVALID_ARGUMENT.

## How a request is built

A GA4 report = `dimensions[]` (group by), `metrics[]` (what to measure),
`dateRanges[]` (1–2), optional `dimensionFilter` / `metricFilter`, optional
`orderBys[]`, `limit` (≤ 200 in this tool). The tool adds the TOTAL row and
returns rows as objects keyed by API name.

Limits enforced by the tool (the API allows more, but a chat answer never
needs it): ≤ 4 dimensions, ≤ 10 metrics, ≤ 2 date ranges, ≤ 200 rows.

## Dates

| Wording                | startDate                     | endDate     |
| ---------------------- | ----------------------------- | ----------- |
| last 7 days            | `7daysAgo`                    | `yesterday` |
| last 28 days (default) | `28daysAgo`                   | `yesterday` |
| last 90 days           | `90daysAgo`                   | `yesterday` |
| this month             | `YYYY-MM-01` (current month)  | `yesterday` |
| last month             | `YYYY-MM-01` … `YYYY-MM-last` | explicit    |
| a specific week        | `YYYY-MM-DD` … `YYYY-MM-DD`   | explicit    |

- Always end on `yesterday`: GA4 reports today only partially and standard
  properties finish processing a day 24–48 h later. Use `today` only when the
  user insists, and label it partial.
- Period comparison = two `dateRanges` of equal length. GA4 adds a `dateRange`
  dimension to every row: `date_range_0` = first range, `date_range_1` =
  second. Previous 28 days = `56daysAgo` → `29daysAgo`.
- Daily trend: dimension `date` (returned as YYYY-MM-DD by the tool), order by
  `{ "dimension": { "dimensionName": "date" } }`.

## Metrics (API name → meaning)

| API name                                                | Meaning                                               | Notes                                        |
| ------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------- |
| `activeUsers`                                           | Distinct users with an engaged session or first visit | "visitors / users". NOT additive across rows |
| `newUsers`                                              | Users whose first visit fell in the range             |                                              |
| `totalUsers`                                            | Users who logged any event                            | ≥ activeUsers                                |
| `sessions`                                              | Visits                                                | "traffic", additive                          |
| `engagedSessions`                                       | Sessions > 10 s, with a key event, or ≥ 2 page views  |                                              |
| `engagementRate`                                        | engagedSessions ÷ sessions, 0–1                       | show as %                                    |
| `bounceRate`                                            | 1 − engagementRate                                    | show as %                                    |
| `averageSessionDuration`                                | Seconds per session                                   | format `2m 14s`                              |
| `userEngagementDuration`                                | Total engaged seconds                                 | ÷ sessions = avg engagement per session      |
| `screenPageViews`                                       | Page views (web) + screen views (app)                 | "page views"                                 |
| `screenPageViewsPerSession`                             | Views per session                                     |                                              |
| `eventCount`                                            | All events                                            | combine with `eventName`                     |
| `keyEvents`                                             | Conversions (events marked as key events)             | "conversions"; combine with `eventName`      |
| `sessionKeyEventRate`                                   | Sessions with a key event ÷ sessions                  |                                              |
| `totalRevenue`                                          | Purchase + ad + subscription revenue                  | only if e-commerce / monetisation is tracked |
| `purchaseRevenue`, `transactions`, `ecommercePurchases` | E-commerce                                            | zero when not tracked — say so               |
| `averagePurchaseRevenue`                                | Revenue per purchase                                  |                                              |

## Dimensions (API name → meaning)

| API name                                                                                                                 | Scope   | Meaning                                                                              |
| ------------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------ |
| `date`, `dayOfWeek` (0 = Sun), `hour`, `week`, `month`, `yearMonth`                                                      | time    | property time zone                                                                   |
| `sessionDefaultChannelGroup`                                                                                             | session | Organic Search, Paid Social, Direct, Referral, Organic Social, Email, Paid Search, … |
| `sessionSource`, `sessionMedium`, `sessionSourceMedium`                                                                  | session | e.g. `google / organic`, `instagram / social`                                        |
| `sessionCampaignName`                                                                                                    | session | UTM campaign of the session; `(not set)` when none                                   |
| `firstUserDefaultChannelGroup`, `firstUserSource`, `firstUserMedium`, `firstUserSourceMedium`, `firstUserCampaignName`   | user    | how the user was FIRST acquired                                                      |
| `landingPage`, `landingPagePlusQueryString`                                                                              | session | first page of the session                                                            |
| `pagePath`, `pageTitle`, `pageLocation`                                                                                  | event   | web pages                                                                            |
| `unifiedScreenName`                                                                                                      | event   | page title (web) or screen name (app) — works for both streams                       |
| `eventName`                                                                                                              | event   | e.g. `page_view`, `purchase`, `generate_lead`                                        |
| `deviceCategory` (desktop/mobile/tablet), `operatingSystem`, `browser`, `platform` (web/iOS/Android), `screenResolution` | device  |
| `country`, `region`, `city`, `language`                                                                                  | geo     |                                                                                      |
| `newVsReturning`                                                                                                         | user    | `new`, `returning`, `(not set)`                                                      |
| `audienceName`                                                                                                           | user    | GA4 audiences                                                                        |
| `itemName`, `itemCategory`, `transactionId`                                                                              | e-com   | only if e-commerce is tracked                                                        |
| `customEvent:<name>`, `customUser:<name>`                                                                                | custom  | find exact names with `searchGoogleAnalyticsFields`                                  |

## Compatibility rules (why INVALID_ARGUMENT happens)

- Session-scoped acquisition (`session*`) and user-scoped acquisition
  (`firstUser*`) can appear together technically, but tell different stories;
  do not mix them in one table.
- Item-scoped dimensions (`itemName`, `itemCategory`, …) pair naturally with
  item metrics (`itemRevenue`, `itemsPurchased`, `itemsViewed`, …). GA4 also
  accepts them with `sessions` / `activeUsers` (verified live), but the figure
  then means "sessions / users that touched that item", not item sales — say
  so.
- `eventName` with `keyEvents` or `eventCount` is fine; `eventName` with
  `sessions` works but counts sessions containing that event.
- Realtime uses its own, much smaller field list (see the realtime tool).
- Deprecated names still break: use `keyEvents`, not `conversions`.
- Misspelt or non-existent names are the most common cause: confirm with
  `searchGoogleAnalyticsFields` before retrying.

## Filters

A `FilterExpression` has exactly one of `filter`, `andGroup`, `orGroup`,
`notExpression`.

```json
{
  "filter": {
    "fieldName": "sessionSourceMedium",
    "stringFilter": {
      "matchType": "CONTAINS",
      "value": "instagram",
      "caseSensitive": false
    }
  }
}
```

```json
{
  "andGroup": {
    "expressions": [
      {
        "filter": {
          "fieldName": "country",
          "stringFilter": { "matchType": "EXACT", "value": "Cyprus" }
        }
      },
      {
        "filter": {
          "fieldName": "deviceCategory",
          "inListFilter": { "values": ["mobile", "tablet"] }
        }
      }
    ]
  }
}
```

Metric filter (numbers can be plain numbers):

```json
{
  "filter": {
    "fieldName": "sessions",
    "numericFilter": { "operation": "GREATER_THAN", "value": 10 }
  }
}
```

`matchType`: `EXACT`, `BEGINS_WITH`, `ENDS_WITH`, `CONTAINS`, `FULL_REGEXP`,
`PARTIAL_REGEXP`. `notExpression` wraps another expression.

## Ordering

```json
[{ "metric": { "metricName": "sessions" }, "desc": true }]
[{ "dimension": { "dimensionName": "date" } }]
[{ "dimension": { "dimensionName": "hour", "orderType": "NUMERIC" } }]
```

Default when omitted and dimensions are present: first metric descending.

## Proven request bodies (validated against a live property)

Totals + daily trend with previous-period comparison:

```json
{
  "dimensions": ["date"],
  "metrics": [
    "activeUsers",
    "newUsers",
    "sessions",
    "engagementRate",
    "averageSessionDuration",
    "keyEvents",
    "screenPageViews"
  ],
  "dateRanges": [
    { "startDate": "28daysAgo", "endDate": "yesterday" },
    { "startDate": "56daysAgo", "endDate": "29daysAgo" }
  ],
  "orderBys": [{ "dimension": { "dimensionName": "date" } }],
  "limit": 200
}
```

Traffic channels (top 10):

```json
{
  "dimensions": ["sessionDefaultChannelGroup"],
  "metrics": ["sessions", "activeUsers"],
  "dateRanges": [{ "startDate": "28daysAgo", "endDate": "yesterday" }],
  "limit": 10
}
```

Campaigns:

```json
{
  "dimensions": ["sessionSourceMedium", "sessionCampaignName"],
  "metrics": ["sessions", "engagementRate", "keyEvents"],
  "dateRanges": [{ "startDate": "28daysAgo", "endDate": "yesterday" }],
  "limit": 15
}
```

Landing pages:

```json
{
  "dimensions": ["landingPage"],
  "metrics": ["sessions", "newUsers", "userEngagementDuration", "keyEvents"],
  "dateRanges": [{ "startDate": "28daysAgo", "endDate": "yesterday" }],
  "limit": 10
}
```

Hour × weekday heatmap (168 rows max — ask for `limit: 200`):

```json
{
  "dimensions": ["dayOfWeek", "hour"],
  "metrics": ["sessions"],
  "dateRanges": [{ "startDate": "28daysAgo", "endDate": "yesterday" }],
  "limit": 200
}
```

Key events by name (only events that converted):

```json
{
  "dimensions": ["eventName"],
  "metrics": ["keyEvents"],
  "dateRanges": [{ "startDate": "28daysAgo", "endDate": "yesterday" }],
  "metricFilter": {
    "filter": {
      "fieldName": "keyEvents",
      "numericFilter": { "operation": "GREATER_THAN", "value": 0 }
    }
  },
  "limit": 10
}
```

Other validated breakdowns: `unifiedScreenName`, `deviceCategory`, `country`,
`city`, `newVsReturning` — each with `["sessions", "activeUsers"]` (plus
`engagementRate` for `newVsReturning`).

Only-Instagram traffic by landing page:

```json
{
  "dimensions": ["landingPage"],
  "metrics": ["sessions", "keyEvents"],
  "dateRanges": [{ "startDate": "28daysAgo", "endDate": "yesterday" }],
  "dimensionFilter": {
    "filter": {
      "fieldName": "sessionSourceMedium",
      "stringFilter": { "matchType": "CONTAINS", "value": "instagram" }
    }
  },
  "limit": 10
}
```

## Wording → fields

- traffic, visits → `sessions`; visitors, users, audience size → `activeUsers`;
  new visitors → `newUsers`
- conversions, leads, orders (as events) → `keyEvents` (+ `eventName`)
- engagement, bounce → `engagementRate`, `bounceRate`, `averageSessionDuration`
- where from, channels → `sessionDefaultChannelGroup`; source/medium detail →
  `sessionSourceMedium`; campaign → `sessionCampaignName`
- most visited pages → `unifiedScreenName` (or `pagePath` web-only); entry
  pages → `landingPage`
- mobile vs desktop → `deviceCategory`; app vs web → `platform`
- where (geo) → `country`, `city`; when → `date`, `dayOfWeek`, `hour`
- revenue, sales on the site → `totalRevenue` / `purchaseRevenue` — only
  meaningful if e-commerce is tracked; a zero means "not tracked", say so

## Caveats to repeat to the user when relevant

- Data thresholds: when Google signals / demographics are on, GA4 withholds
  rows that could identify individuals — small segments vanish, totals stay.
- `(other)`: high-cardinality dimensions get folded into an "(other)" row.
- `(not set)`: the value was not captured (e.g. no UTM campaign). Keep it.
- `activeUsers` across rows or days does not add up to the total; use the
  TOTAL row.
- Quota: a standard property has 200,000 Data API tokens per day; a report
  costs a handful. Do not loop over many ranges or properties.
