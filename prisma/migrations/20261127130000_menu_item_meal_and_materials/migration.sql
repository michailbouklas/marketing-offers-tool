-- Menu items: meal flag + size; lines can be raw SAP materials.
-- Hand-edited: recipe_name is RENAMED to name (Prisma's diff would drop and
-- re-add it), so the migration keeps any existing line names.

-- AlterTable
ALTER TABLE "menu_item" ADD COLUMN     "meal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "size" VARCHAR(10);

-- AlterTable
ALTER TABLE "menu_item_line" RENAME COLUMN "recipe_name" TO "name";

-- AlterTable
ALTER TABLE "menu_item_line" ADD COLUMN     "database_id" VARCHAR(7),
ADD COLUMN     "item_number" VARCHAR(50),
ADD COLUMN     "uom" VARCHAR(100) NOT NULL DEFAULT '',
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(24,12);
