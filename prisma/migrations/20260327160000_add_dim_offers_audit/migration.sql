-- CreateEnum
CREATE TYPE "DimOffersAuditAction" AS ENUM ('insert', 'update');

-- CreateEnum
CREATE TYPE "DimOffersAuditSource" AS ENUM ('gap_approval');

-- CreateTable
CREATE TABLE "dim_offers_audit" (
    "id" SERIAL NOT NULL,
    "item_code" VARCHAR NOT NULL,
    "action" "DimOffersAuditAction" NOT NULL,
    "source" "DimOffersAuditSource" NOT NULL DEFAULT 'gap_approval',
    "changed_by" VARCHAR NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staging_id" INTEGER,
    "dq_id" INTEGER,
    "before_values" JSONB,
    "after_values" JSONB NOT NULL,
    "changed_fields" TEXT[] NOT NULL,

    CONSTRAINT "dim_offers_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dim_offers_audit_item_code_idx" ON "dim_offers_audit"("item_code");

-- CreateIndex
CREATE INDEX "dim_offers_audit_changed_by_idx" ON "dim_offers_audit"("changed_by");

-- CreateIndex
CREATE INDEX "dim_offers_audit_changed_at_idx" ON "dim_offers_audit"("changed_at");

-- CreateIndex
CREATE INDEX "dim_offers_audit_staging_id_idx" ON "dim_offers_audit"("staging_id");

-- CreateIndex
CREATE INDEX "dim_offers_audit_dq_id_idx" ON "dim_offers_audit"("dq_id");

-- AddForeignKey
ALTER TABLE "dim_offers_audit" ADD CONSTRAINT "dim_offers_audit_staging_id_fkey" FOREIGN KEY ("staging_id") REFERENCES "dim_offers_staging"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dim_offers_audit" ADD CONSTRAINT "dim_offers_audit_dq_id_fkey" FOREIGN KEY ("dq_id") REFERENCES "dq_missing_offers_pricing"("dq_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dim_offers_audit" ADD CONSTRAINT "dim_offers_audit_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
