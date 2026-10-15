-- AlterTable
ALTER TABLE "brand" ADD COLUMN     "google_places_brand_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "brand_google_places_brand_id_key" ON "brand"("google_places_brand_id");
