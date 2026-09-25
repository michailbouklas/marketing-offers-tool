-- Offers data-quality: gap-queue snapshot ("materialized view") + rebuild log.
--
-- /offers-data-quality used to re-run the full gap detection (a ClickHouse scan
-- of transaction_details since 2024 joined to dim_items/dim_offers, merged in
-- JS with dq_missing_offers_pricing) on every page view, sort and filter.
--
-- dq_gap_queue_snapshot holds one row per item currently open or submitted.
-- It is rebuilt nightly (04:00 Europe/Nicosia, croner) or on demand, and
-- patched row-by-row on every gap status change (submit / approve / reject),
-- so reads are a plain indexed Postgres query. A real MATERIALIZED VIEW was
-- rejected because it can only be refreshed as a whole.
--
-- dq_gap_queue_refresh records every rebuild run (trigger, outcome, counts) for
-- the "data as of" label and admin diagnostics.
--
-- Additive only: no existing table or column is changed or dropped.

-- CreateEnum
CREATE TYPE "DqSnapshotRefreshStatus" AS ENUM ('running', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "dq_gap_queue_snapshot" (
    "trde_item" VARCHAR NOT NULL,
    "dq_id" INTEGER NOT NULL,
    "item_name" VARCHAR NOT NULL,
    "brand" VARCHAR NOT NULL,
    "brand_aliases" TEXT[],
    "item_category" VARCHAR NOT NULL,
    "missing_fields" VARCHAR NOT NULL,
    "status" "DqGapStatus" NOT NULL DEFAULT 'open',
    "detected_at" TIMESTAMP(3) NOT NULL,
    "channel" VARCHAR,
    "category" VARCHAR,
    "subcategory" VARCHAR,
    "ideal_price" DOUBLE PRECISION,
    "selling_price" DOUBLE PRECISION,
    "fc_perc" DOUBLE PRECISION,
    "mktg_spend" DOUBLE PRECISION,
    "source" VARCHAR NOT NULL,
    "refreshed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dq_gap_queue_snapshot_pkey" PRIMARY KEY ("trde_item")
);

-- CreateTable
CREATE TABLE "dq_gap_queue_refresh" (
    "id" SERIAL NOT NULL,
    "trigger" VARCHAR NOT NULL,
    "status" "DqSnapshotRefreshStatus" NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "detected_items" INTEGER,
    "created_gaps" INTEGER,
    "resolved_gaps" INTEGER,
    "snapshot_rows" INTEGER,
    "error" TEXT,

    CONSTRAINT "dq_gap_queue_refresh_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dq_gap_queue_snapshot_dq_id_key" ON "dq_gap_queue_snapshot"("dq_id");

-- CreateIndex
CREATE INDEX "dq_gap_queue_snapshot_status_idx" ON "dq_gap_queue_snapshot"("status");

-- CreateIndex
CREATE INDEX "dq_gap_queue_snapshot_brand_idx" ON "dq_gap_queue_snapshot"("brand");

-- CreateIndex
CREATE INDEX "dq_gap_queue_snapshot_item_name_idx" ON "dq_gap_queue_snapshot"("item_name");

-- CreateIndex
CREATE INDEX "dq_gap_queue_snapshot_detected_at_idx" ON "dq_gap_queue_snapshot"("detected_at");

-- CreateIndex
CREATE INDEX "dq_gap_queue_snapshot_brand_aliases_idx" ON "dq_gap_queue_snapshot" USING GIN ("brand_aliases");

-- CreateIndex
CREATE INDEX "dq_gap_queue_refresh_status_finished_at_idx" ON "dq_gap_queue_refresh"("status", "finished_at");

-- AddForeignKey
ALTER TABLE "dq_gap_queue_snapshot" ADD CONSTRAINT "dq_gap_queue_snapshot_dq_id_fkey" FOREIGN KEY ("dq_id") REFERENCES "dq_missing_offers_pricing"("dq_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one active (open/submitted) gap per item. The rebuild relies on this
-- when it links snapshot rows to gap records. Verified on the live database
-- before writing this migration: no item had more than one active record.
-- Partial indexes are not representable in schema.prisma; Prisma ignores them
-- when diffing, so this does not register as drift.
CREATE UNIQUE INDEX "dq_missing_offers_pricing_active_item_key"
  ON "dq_missing_offers_pricing"("trde_item")
  WHERE "status" IN ('open', 'submitted');
