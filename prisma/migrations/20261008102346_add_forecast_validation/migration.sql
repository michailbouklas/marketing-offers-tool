-- Forecast validation: recorded forecasts + their comparison with actual sales.
--
-- `bun run forecast:validate` runs every model for every active brand over an
-- N-day window (default 7) and stores one forecast_validation_run per
-- brand × model × horizon at the brand's latest sales date (cutoff), with its
-- daily points in forecast_validation_point. A daily croner sweep
-- (FORECAST_VALIDATION_CRON, default 06:00 Europe/Nicosia) then scores each run
-- once its window has passed and the warehouse has every day of it, filling
-- actual_total, deviation, WAPE/bias/coverage and the high/medium/low quality.
--
-- The unique key (brand_alias, model_id, horizon_days, cutoff_date) makes a
-- re-run on the same day idempotent.
--
-- Additive only: no existing table or column is changed or dropped.

-- CreateEnum
CREATE TYPE "ForecastValidationStatus" AS ENUM ('pending', 'evaluated', 'skipped', 'failed');

-- CreateTable
CREATE TABLE "forecast_validation_run" (
    "id" SERIAL NOT NULL,
    "batch_id" VARCHAR NOT NULL,
    "trigger" VARCHAR NOT NULL,
    "brand_alias" VARCHAR NOT NULL,
    "brand_name" VARCHAR NOT NULL,
    "model_id" VARCHAR NOT NULL,
    "model_version" VARCHAR NOT NULL,
    "engine_version" VARCHAR NOT NULL,
    "horizon_days" INTEGER NOT NULL,
    "cutoff_date" DATE NOT NULL,
    "forecast_from" DATE NOT NULL,
    "forecast_to" DATE NOT NULL,
    "evaluate_after" DATE NOT NULL,
    "status" "ForecastValidationStatus" NOT NULL DEFAULT 'pending',
    "forecast_total" DOUBLE PRECISION NOT NULL,
    "forecast_lower80" DOUBLE PRECISION NOT NULL,
    "forecast_upper80" DOUBLE PRECISION NOT NULL,
    "backtest_wape_pct" DOUBLE PRECISION,
    "backtest_grade" VARCHAR,
    "warnings" JSONB NOT NULL,
    "actual_total" DOUBLE PRECISION,
    "actual_days" INTEGER,
    "deviation" DOUBLE PRECISION,
    "deviation_pct" DOUBLE PRECISION,
    "wape_pct" DOUBLE PRECISION,
    "bias_pct" DOUBLE PRECISION,
    "coverage80_pct" DOUBLE PRECISION,
    "quality" VARCHAR,
    "evaluated_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecast_validation_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_validation_point" (
    "id" SERIAL NOT NULL,
    "run_id" INTEGER NOT NULL,
    "ds" DATE NOT NULL,
    "yhat" DOUBLE PRECISION NOT NULL,
    "lo80" DOUBLE PRECISION NOT NULL,
    "hi80" DOUBLE PRECISION NOT NULL,
    "actual" DOUBLE PRECISION,

    CONSTRAINT "forecast_validation_point_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "forecast_validation_run_status_evaluate_after_idx" ON "forecast_validation_run"("status", "evaluate_after");

-- CreateIndex
CREATE INDEX "forecast_validation_run_batch_id_idx" ON "forecast_validation_run"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_validation_run_brand_alias_model_id_horizon_days_c_key" ON "forecast_validation_run"("brand_alias", "model_id", "horizon_days", "cutoff_date");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_validation_point_run_id_ds_key" ON "forecast_validation_point"("run_id", "ds");

-- AddForeignKey
ALTER TABLE "forecast_validation_point" ADD CONSTRAINT "forecast_validation_point_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "forecast_validation_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
