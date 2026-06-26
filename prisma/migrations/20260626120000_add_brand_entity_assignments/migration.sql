-- CreateEnum
CREATE TYPE "BrandEntityType" AS ENUM ('competitionRestaurant', 'googleReviewsBusiness');

-- CreateTable
CREATE TABLE "brand_entity" (
    "id" TEXT NOT NULL,
    "brandId" INTEGER NOT NULL,
    "entityType" "BrandEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_entity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_entity_brandId_idx" ON "brand_entity"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "brand_entity_entityType_entityId_key" ON "brand_entity"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "brand_entity" ADD CONSTRAINT "brand_entity_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
