-- AlterTable
ALTER TABLE "brand" ADD COLUMN     "ideal_fc_perc" DECIMAL(5,4);

-- AlterTable
ALTER TABLE "dim_offers_staging" ADD COLUMN     "brand_ideal_fc_perc" DECIMAL(5,4),
ADD COLUMN     "fc_eur" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "dq_gap_queue_snapshot" ADD COLUMN     "fc_eur" DOUBLE PRECISION;
