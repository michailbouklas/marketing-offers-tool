-- CreateEnum
CREATE TYPE "DqGapStatus" AS ENUM ('open', 'submitted', 'resolved');

-- CreateEnum
CREATE TYPE "DimOffersStagingStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "channels" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dq_missing_offers_pricing" (
    "dq_id" SERIAL NOT NULL,
    "trde_item" VARCHAR NOT NULL,
    "item_name" VARCHAR NOT NULL,
    "brand" VARCHAR NOT NULL,
    "item_category" VARCHAR NOT NULL,
    "missing_fields" VARCHAR NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DqGapStatus" NOT NULL DEFAULT 'open',
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "dq_missing_offers_pricing_pkey" PRIMARY KEY ("dq_id")
);

-- CreateTable
CREATE TABLE "dim_offers_staging" (
    "id" SERIAL NOT NULL,
    "dq_id" INTEGER NOT NULL,
    "item_code" VARCHAR NOT NULL,
    "channel" VARCHAR NOT NULL,
    "category" VARCHAR NOT NULL,
    "subcategory" VARCHAR NOT NULL,
    "ideal_price" DECIMAL(10,2) NOT NULL,
    "selling_price" DECIMAL(10,2) NOT NULL,
    "fc_perc" DECIMAL(5,4) NOT NULL,
    "mktg_spend" DECIMAL(10,2),
    "notes" VARCHAR(500),
    "submitted_by" VARCHAR NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" VARCHAR,
    "approved_at" TIMESTAMP(3),
    "status" "DimOffersStagingStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "dim_offers_staging_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channels_name_key" ON "channels"("name");

-- CreateIndex
CREATE INDEX "dq_missing_offers_pricing_status_idx" ON "dq_missing_offers_pricing"("status");

-- CreateIndex
CREATE INDEX "dq_missing_offers_pricing_trde_item_idx" ON "dq_missing_offers_pricing"("trde_item");

-- CreateIndex
CREATE INDEX "dim_offers_staging_dq_id_idx" ON "dim_offers_staging"("dq_id");

-- CreateIndex
CREATE INDEX "dim_offers_staging_item_code_idx" ON "dim_offers_staging"("item_code");

-- CreateIndex
CREATE INDEX "dim_offers_staging_status_idx" ON "dim_offers_staging"("status");

-- AddForeignKey
ALTER TABLE "dim_offers_staging" ADD CONSTRAINT "dim_offers_staging_dq_id_fkey" FOREIGN KEY ("dq_id") REFERENCES "dq_missing_offers_pricing"("dq_id") ON DELETE RESTRICT ON UPDATE CASCADE;
