-- CreateTable
CREATE TABLE "brand_google_analytics_property" (
    "id" TEXT NOT NULL,
    "brandId" INTEGER NOT NULL,
    "propertyId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "credentialsEncrypted" TEXT NOT NULL,
    "credentialsClientEmail" TEXT NOT NULL,
    "credentialsKeyId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_google_analytics_property_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_google_analytics_property_brandId_idx" ON "brand_google_analytics_property"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "brand_google_analytics_property_brandId_propertyId_key" ON "brand_google_analytics_property"("brandId", "propertyId");

-- AddForeignKey
ALTER TABLE "brand_google_analytics_property" ADD CONSTRAINT "brand_google_analytics_property_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
