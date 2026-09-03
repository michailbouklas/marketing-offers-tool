---
name: forecast-models
description: How the Sales Forecasts engine works — the five models (Seasonal Trend, Statistical Baseline, Calendar Boost, Blend, Foundation (TimesFM)), how accuracy is measured and graded (holdout, WAPE, MAPE, MAE, bias, 80 % coverage, high/medium/low confidence), what every warning and error code means, and the system's limitations. Load it to explain models, metrics, grades or warnings in plain language.
---

# Sales Forecasts — models, metrics and warnings

Use this skill whenever the user asks what a model does, why two models
differ or one is "more confident", what a metric or grade means, what a
warning says, or what the system can and cannot do. Definition questions need
NO tool call. When the user asks about _their_ numbers, combine this skill
with the `accuracy`, `warnings` and `narrative` blocks of the tool result.

## How a forecast is produced

1. **Series.** The app reads the brand's daily NET revenue from the POS
   warehouse: `sum(tran_net)` over `transactions` rows with
   `tran_sales_factor = 1`, per `tran_date`, optionally for one
   `tran_location`. Up to about three years (1095 days) of history are used.
2. **Cutoff.** The last day with recorded sales is the _cutoff date_; the
   forecast starts the day after. It is never "today" — the warehouse lags.
3. **Clean-up** (the engine, before any model runs): leading zero days are
   trimmed; missing days become zero (`GAPS_FILLED`); negative days (refunds)
   are clipped to zero (`NEGATIVE_CLIPPED`); a run of 7+ zero days is treated
   as a closure and set aside (`CLOSURE_PERIOD`); unusual spikes/dips are
   flagged but kept (`OUTLIERS_DETECTED`); fewer than 56 days → the request
   is refused (`INSUFFICIENT_HISTORY`).
4. **Accuracy test**, then the final fit on all data (see below).
5. **Summary**: expected total, likely range, vs last year, vs the trailing
   period, trend, weekday pattern, upcoming holidays, warnings.

Each result is cached for a few hours per brand / store / model / horizon /
cutoff; a new warehouse day invalidates it. **No forecast is stored** — there
is no archive to look back at.

## The models

| id                     | Name                 | What it "sees"                                                                                                                                                                                                                        | Needs    | Holidays  |
| ---------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| `seasonal_trend`       | Seasonal Trend       | Prophet: a smooth trend, the weekly rhythm, and a yearly cycle once there are ≥ 400 days of history; public holidays (Cyprus) as day effects                                                                                          | 60 days  | yes       |
| `statistical_baseline` | Statistical Baseline | MSTL decomposition (weekly, plus yearly with ≥ 730 days) + AutoETS for the trend — fast and robust                                                                                                                                    | 60 days  | no        |
| `calendar_boost`       | Calendar Boost       | Gradient-boosted trees on calendar features (weekday, day of month, payday window 25th–3rd, yearly cycle), holiday-distance features (eve, day after, bridge day, ±7 days) and recent lags (7/14/21/28 days, plus 364 with ≥ 2 years) | 120 days | yes       |
| `blend`                | Blend                | Equal-weight average of the three models above — point forecast and range                                                                                                                                                             | 120 days | inherited |
| `foundation`           | Foundation (TimesFM) | Google's pretrained TimesFM 2.5 model: reads the last ~3 years of daily sales and forecasts zero-shot (no fitting). Only the numbers — no holiday, payday or offer knowledge. Present only where the deployment enables it            | 90 days  | no        |

**Plain-language strengths and blind spots**

- _Seasonal Trend_ — good at the weekly rhythm and the summer/winter cycle;
  models the holiday **day** itself but not the eve, bridge day or Easter
  week around it. Its trend can overshoot on 90-day horizons. Slowest.
- _Statistical Baseline_ — steady and quick; knows nothing about holidays or
  paydays, so it treats them as noise. A good sanity check.
- _Calendar Boost_ — learns how paydays, holiday eves/bridge days, Easter
  week and the last few weeks shape sales; best for the next 7–30 days. Needs
  120 days; with little history its ranges are wider.
- _Blend_ — averages the three so no single method's blind spot drives the
  headline number; usually the most reliable pick. If one member cannot run
  (too little history, or it failed) the blend proceeds with the rest and
  reports `FALLBACK_MODEL_USED`; fewer than two members → the run fails. It
  costs the sum of its members' time. Foundation (TimesFM) is not a member.
- _Foundation (TimesFM)_ — a pretrained "pattern library" of millions of
  series; strongest on short history (works from 90 days), regime changes and
  irregular spikes, and its ranges are well calibrated. Blind to holidays,
  paydays and offers, so around Easter or a promotion prefer Calendar Boost.
  Its in-sample line is a rolling two-week-ahead replay, not a fit. Treat it as
  an independent second opinion: when it agrees with Calendar Boost, trust the
  number more; when they disagree, the calendar usually explains why.

QSR demand is driven by _known calendar events_ (holiday eves and bridge
days, Easter week, month-end paydays) that pure curve-fitters only see as
noise — that is why Calendar Boost is often graded better on 7–30 days, and
why Blend exists.

## How accuracy is measured (same method for every model)

- **Holdout test.** Before the final fit, the engine hides the most recent
  days — `min(horizon, 28, history ÷ 5)` days — fits the model on the rest and
  scores its forecast of those hidden days. One fold by default. Closure days
  are excluded from scoring.
- **WAPE** (weighted absolute % error) — the headline metric: total absolute
  miss divided by total actual sales over the holdout. "9 % WAPE" ≈ the
  model's _total_ over such a period was typically 9 % off.
- **MAPE** — average of the daily % misses (null when a holdout day had zero
  sales). More sensitive to small days than WAPE. The UI's "typically off by"
  figure uses MAPE when available, otherwise WAPE.
- **MAE** — average daily miss in euros.
- **Bias %** — signed: positive = the model over-forecast on the holdout,
  negative = it under-forecast. Near zero is good.
- **80 % coverage** — share of holdout days whose actual fell inside the
  80 % band. Ideal ≈ 80. Much higher means the band is wider than needed;
  much lower means the band is too narrow (over-confident).
- **Grade** from WAPE: ≤ 12 % → **high**, ≤ 25 % → **medium**, otherwise
  **low** confidence. Because every model uses the same holdout code, grades
  are comparable across models for the same brand/store/horizon.
- Caveats to mention when relevant: a single holdout fold is a small sample;
  store-level series are noisier than brand-level; a holdout that contains a
  holiday or closure can swing the grade.

**"Why is Calendar Boost more confident than Seasonal Trend here?"** —
usually because the holdout period contained calendar effects (a payday
window, a holiday eve, a bridge day) that Calendar Boost models as features
and Prophet does not, so its holdout miss was smaller. Check the `accuracy`
blocks: compare `wapePct`, `holdoutDays` and `coverage80Pct`, and look at
`warnings` for `INSUFFICIENT_FOR_YEARLY` or `OUTLIERS_DETECTED`.

## Other result fields

- **Range (lo80–hi80, lo95–hi95).** 80 % / 95 % prediction bands per day;
  `horizonLower80/Upper80` are the band totals. Weekly buckets in tool output
  sum the daily bounds, so they are approximate.
- **Trend.** Slope of the fitted level over the last ~90 days, expressed as %
  per 30 days; within ±3 % counts as "holding steady".
- **vs last year** needs at least a year plus the horizon of history
  (otherwise `samePeriodLastYear` is null); **vs trailing** compares with
  the same number of days immediately before the cutoff.
- **Weekday pattern** — strongest and weakest weekday and the uplift of the
  strongest over an average day.
- **Upcoming holidays** — Cyprus public holidays inside the horizon with the
  model's expected effect where available.
- **Average order value** — revenue ÷ orders over the last 90 open days.

## Warning codes

| Code                       | Plain meaning                                                          | What to tell the user                                                               |
| -------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `INSUFFICIENT_FOR_YEARLY`  | Less than ~13 months of history, so yearly seasonality is not modelled | Seasonal swings across the year are not captured yet; treat long horizons with care |
| `GAPS_FILLED`              | Days without sales rows were treated as zero                           | Fine if the store was closed; a data-load gap would drag the forecast down          |
| `CLOSURE_PERIOD`           | A run of 7+ zero days was set aside when fitting                       | Expected for renovations/closures                                                   |
| `NEGATIVE_CLIPPED`         | Refund-heavy days below zero were treated as zero                      | Harmless                                                                            |
| `OUTLIERS_DETECTED`        | Unusually high/low days were spotted (kept, flagged)                   | They may pull the forecast slightly                                                 |
| `HORIZON_LONG_FOR_HISTORY` | Horizon > a third of the available history                             | Further-out days are less certain; prefer a shorter horizon                         |
| `HOLIDAYS_UNAVAILABLE`     | Holiday effects could not be included                                  | Holiday days may be under/over-forecast                                             |
| `BACKTEST_SKIPPED`         | The accuracy test could not run                                        | `accuracy` is null — confidence not measured                                        |
| `FALLBACK_MODEL_USED`      | A simpler method replaced the main one, or Blend ran without a member  | Result is still valid; mention the substitution                                     |

## Errors the user may hit

- `INSUFFICIENT_HISTORY` — the brand/store has fewer days than the model
  needs (56 minimum overall; 60 / 60 / 120 / 120 per model). Suggest a model
  with a lower minimum, or forecasting all stores instead of one.
- `NO_SALES_DATA` — no sales in the lookback window; nothing to forecast.
- `ENGINE_UNAVAILABLE` / `ENGINE_TIMEOUT` / `ENGINE_REJECTED` — the forecast
  service is down, slow, or busy; retry in a moment (a shorter horizon is
  faster).
- `FORBIDDEN` — the brand is not assigned to the user; reply exactly
  "You're not assigned to this brand".

## Limitations — say them when they matter

- No exogenous inputs: promotions, price changes, weather, competitor
  activity and marketing spend are invisible to every model. A forecast
  assumes "business as usual".
- No archive of past forecasts; accuracy is only ever measured on the
  holdout of the current run.
- Results are cached for a few hours; a forecast will not move until the
  warehouse receives a new day.
- Store-level series are noisier and have shorter history than the brand.
- Holidays are Cyprus public holidays only.

## "Which number should I plan with?"

Match the Compare page's own logic (the tool returns the sentence as
`recommendation`, relay it):

1. If no model could be accuracy-tested, use the average of the models as a
   working number.
2. Otherwise lean on the model with the lowest typical miss (MAPE, else
   WAPE); if the two best are within 1 point of each other, use their
   average.
3. Name the other models as cross-checks. A spread under 5 % between models
   means a robust outlook; over 15 % means look at why they disagree before
   trusting one number.
