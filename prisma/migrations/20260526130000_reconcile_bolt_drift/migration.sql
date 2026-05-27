-- Reconcile drift between baseline migration (20260526110000_baseline_bolt_tables)
-- and the dev/prod DB. The baseline was captured via `prisma db pull --print`
-- but recorded types/constraints that do not exactly match the live DB:
--
--   1. bolt_company_mappings.bp_code: baseline = REAL, live = DOUBLE PRECISION
--      (schema.prisma uses Float => DOUBLE PRECISION).
--   2. api_BOLT_lines_documentid_fkey: baseline = ON UPDATE NO ACTION,
--      live = ON UPDATE CASCADE.
--
-- Both statements below are idempotent / no-op when the DB already matches
-- the target shape, so this migration is safe to run on environments where
-- the column/FK is already in the desired state.

-- 1) Align bp_code to DOUBLE PRECISION. No-op when already double precision.
ALTER TABLE "bolt_company_mappings"
  ALTER COLUMN "bp_code" TYPE DOUBLE PRECISION USING "bp_code"::double precision;

-- 2) Align api_BOLT_lines FK ON UPDATE behaviour. Drop & re-add with CASCADE
--    on both update and delete. No-op-equivalent when already CASCADE/CASCADE.
ALTER TABLE "api_BOLT_lines"
  DROP CONSTRAINT IF EXISTS "api_BOLT_lines_documentid_fkey";

ALTER TABLE "api_BOLT_lines"
  ADD CONSTRAINT "api_BOLT_lines_documentid_fkey"
  FOREIGN KEY ("documentid") REFERENCES "api_BOLT_header" ("documentid")
  ON UPDATE CASCADE ON DELETE CASCADE;
