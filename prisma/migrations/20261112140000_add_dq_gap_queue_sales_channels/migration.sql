-- AlterTable
ALTER TABLE "dq_gap_queue_snapshot" ADD COLUMN     "sales_channels" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "dq_gap_queue_snapshot_sales_channels_idx" ON "dq_gap_queue_snapshot" USING GIN ("sales_channels");

