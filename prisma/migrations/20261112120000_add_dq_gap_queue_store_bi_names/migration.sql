-- AlterTable
ALTER TABLE "dq_gap_queue_snapshot" ADD COLUMN     "store_bi_names" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "dq_gap_queue_snapshot_store_bi_names_idx" ON "dq_gap_queue_snapshot" USING GIN ("store_bi_names");

