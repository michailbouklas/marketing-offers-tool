-- The 2026-11-12 menu_item tables (empty, their migration file was never
-- committed) are replaced: lines now point at recipes, not POS item codes.
DROP TABLE IF EXISTS "menu_item_line";
DROP TABLE IF EXISTS "menu_item";

-- CreateTable
CREATE TABLE "menu_item" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(100) NOT NULL DEFAULT '',
    "lto" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "price" DECIMAL(10,2),
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_line" (
    "id" SERIAL NOT NULL,
    "menuItemId" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "recipeId" INTEGER,
    "recipe_name" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,

    CONSTRAINT "menu_item_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_brandId_name_key" ON "menu_item"("brandId", "name");

-- CreateIndex
CREATE INDEX "menu_item_line_menuItemId_idx" ON "menu_item_line"("menuItemId");

-- CreateIndex
CREATE INDEX "menu_item_line_recipeId_idx" ON "menu_item_line"("recipeId");

-- AddForeignKey
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_line" ADD CONSTRAINT "menu_item_line_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_line" ADD CONSTRAINT "menu_item_line_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

