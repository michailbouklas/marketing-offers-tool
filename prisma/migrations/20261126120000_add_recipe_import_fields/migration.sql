-- AlterTable
ALTER TABLE "recipe" ADD COLUMN     "import_name" TEXT,
ALTER COLUMN "item_code" DROP NOT NULL;

-- AlterTable
ALTER TABLE "recipe_line" ADD COLUMN     "recipe_quantity" DECIMAL(18,6);

-- CreateIndex
CREATE UNIQUE INDEX "recipe_brandId_import_name_key" ON "recipe"("brandId", "import_name");

