-- AlterEnum
-- Kept alone in this migration on purpose. Since PostgreSQL 12 `ALTER TYPE ...
-- ADD VALUE` is allowed inside a transaction block (which Prisma Migrate uses
-- per migration), but the new value may not be *used* in that same
-- transaction. Isolating it guarantees any later migration referencing
-- 'aggregatorStore' commits separately.
ALTER TYPE "BrandEntityType" ADD VALUE 'aggregatorStore';
