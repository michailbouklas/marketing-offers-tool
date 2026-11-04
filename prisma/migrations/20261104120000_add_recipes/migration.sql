-- CreateTable
CREATE TABLE "recipe" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "item_code" VARCHAR(100) NOT NULL,
    "item_description" TEXT NOT NULL DEFAULT '',
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_line" (
    "id" SERIAL NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "database_id" VARCHAR(7) NOT NULL,
    "item_number" VARCHAR(50) NOT NULL,
    "item_description" TEXT NOT NULL DEFAULT '',
    "uom" VARCHAR(100) NOT NULL DEFAULT '',
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit_cost_snapshot" DECIMAL(19,6),

    CONSTRAINT "recipe_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recipe_brandId_item_code_key" ON "recipe"("brandId", "item_code");

-- CreateIndex
CREATE INDEX "recipe_line_recipeId_idx" ON "recipe_line"("recipeId");

-- AddForeignKey
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_line" ADD CONSTRAINT "recipe_line_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

