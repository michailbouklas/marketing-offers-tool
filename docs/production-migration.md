# Production Database Migration — Runbook

**Audience:** backend / platform team responsible for the production database.
**App:** `marketing-offers-tool` (SvelteKit + Prisma 7 + PostgreSQL, ClickHouse used as a read-only analytics source).
**Goal:** safely apply all Prisma migrations currently in `prisma/migrations/` to the production PostgreSQL database for the first production deploy of this app.

> Project rule (`CLAUDE.md` / `AGENTS.md`): **never `db push`, always `migrate`; never destructive migrations without team sign-off.** This document follows that rule.

---

## 1. Summary of what will be applied

There are **14 migrations** in `prisma/migrations/`, in this order:

| #   | Migration directory                                     | Nature                                                | Risk        |
| --- | ------------------------------------------------------- | ----------------------------------------------------- | ----------- |
| 1   | `0_init`                                                | Initial schema (offers, WOLT tables, etc.)            | Low if DB is empty |
| 2   | `20260311115213_add_better_auth_tables`                 | Adds `user`, `session`, `account`, `verification`     | Low         |
| 3   | `20260311133000_add_user_role`                          | Adds `user.role` + backfill                           | Low         |
| 4   | `20260311142000_add_better_auth_admin_fields`           | Adds `banned`, `banReason`, `banExpires`, `impersonatedBy` | Low    |
| 5   | `20260312170000_link_aggregator_offers_to_brand`        | **Drops `aggregator_offers.brand_name`, adds NOT NULL `brand_id` FK** | **HIGH — see §4.1** |
| 6   | `20260317102846_add_categories_subcategories`           | `DROP INDEX brand_slug_key`, adds `categories` + `subcategories` | Medium — see §4.2 |
| 7   | `20260327082052_add_offers_data_quality_tables`         | Adds DQ enums + `dq_missing_offers_pricing`, `dim_offers_staging`, `channels` | Low |
| 8   | `20260327094437_add_brand_alias`                        | Adds `brand.alias`                                    | Low         |
| 9   | `20260327123000_add_user_brand_assignments`             | Adds `user_brand` junction table                      | Low         |
| 10  | `20260327160000_add_dim_offers_audit`                   | Adds `dim_offers_audit` + enums                       | Low         |
| 11  | `20260526110000_baseline_bolt_tables`                   | **Creates BOLT tables (baseline of out-of-Prisma changes)** | **HIGH — see §4.3** |
| 12  | `20260526120000_add_image_generator`                    | Adds `GeneratedImage`, `ReferenceImage` + enum        | Low         |
| 13  | `20260526130000_reconcile_bolt_drift`                   | Changes `bolt_company_mappings.bp_code` REAL → DOUBLE PRECISION; redefines BOLT lines FK | Medium — see §4.4 |
| 14  | `20260526133551_add_brand_context_to_image_generator`   | Adds `BrandAsset`, `GeneratedImage.brandId` FK        | Low         |

The three migrations marked HIGH/Medium need an explicit decision **before** anything is run. Sections 4.1–4.4 below explain each one and what to do.

---

## 2. Pre-flight (do all of these before running anything)

### 2.1 Confirm code parity

The deployed application image must contain **the exact same** `prisma/migrations/` directory that was reviewed for this runbook. Verify:

```bash
git rev-parse HEAD
git status prisma/migrations
ls prisma/migrations
```

The list of directories returned must match the 14 migrations in §1.

### 2.2 Confirm environment variables on the prod host

At minimum, the following must be set in the prod environment (see `.env.example`):

- `DATABASE_URL` — **must point at the production PostgreSQL DB you intend to migrate.** Triple-check this; the most common mistake is running `migrate deploy` against staging.
- `CLICKHOUSE_URL`, `CLICKHOUSE_DATABASE`, `CLICKHOUSE_USERNAME`, `CLICKHOUSE_PASSWORD` — required at runtime, not for migration.
- `BETTER_AUTH_SECRET` (≥32 chars), `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`.
- `UPLOADS_DIR` — must point at a **persistent** volume mount; the parent directory must already exist and be writable by the Node process user. The app will create `images/` and `references/` lazily under it. **Do not let `UPLOADS_DIR` default to `./uploads` in prod.**
- `ORIGIN`, `HOST`, `PORT` for the SvelteKit Node adapter.

Verify the value of `DATABASE_URL` in the shell you are about to run from:

```bash
# bash
echo "${DATABASE_URL%%@*}@…"   # prints user:pass@ then masks the host

# PowerShell
$env:DATABASE_URL
```

### 2.3 Take a logical backup of the prod database

**Non-negotiable.** Required by `README.md` § _Production / shared DB — safe migration workflow_.

```bash
pg_dump --format=custom --no-owner --no-privileges \
  --file=backup-$(date +%Y%m%d-%H%M).dump "$DATABASE_URL"
```

Verify the file is non-empty and copy it off the prod host before continuing.

### 2.4 Check current state of the prod database

This is the single most important diagnostic step. Run, against the prod `DATABASE_URL`:

```bash
bunx prisma migrate status
```

There are three likely outcomes — your next step depends on which one you see:

| `migrate status` output                                                                 | Meaning                                                                                                         | Go to     |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| "Database schema is up to date" + a list of all 14 migrations as **Pending**            | Empty/fresh DB. No `_prisma_migrations` table yet, or it is empty.                                              | §3 (Path A) |
| "Drift detected" or "following migration(s) have not yet been applied" with extra notes | Prod DB has tables Prisma doesn't know about (e.g. legacy `api_BOLT_*`, `brand`, anything pre-existing).        | §3 (Path B) |
| "Database schema is up to date" + **no pending migrations**                             | Prod DB already has every migration applied. Nothing to do — skip to §6.                                        | §6        |

Also dump the public-schema relation list for the record, so you can compare it to what Prisma expects:

```bash
psql "$DATABASE_URL" -c "\dt public.*"
psql "$DATABASE_URL" -c "\dT public.*"        # enums
psql "$DATABASE_URL" -c "SELECT * FROM _prisma_migrations ORDER BY started_at;"  # if the table exists
```

Save this output — you will need it in §4 to decide whether to `migrate resolve` any baseline migrations.

### 2.5 Sanity-check row counts in tables that participate in destructive migrations

The two tables touched by destructive migrations are `aggregator_offers` (migration #5) and `bolt_company_mappings` (migration #13). Run:

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM aggregator_offers;"        # may not exist yet → that is fine
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM bolt_company_mappings;"    # may not exist yet → that is fine
```

If either of those tables exists with rows, read §4.1 and §4.4 carefully.

---

## 3. Decide the migration path

### Path A — prod DB is empty / freshly created for this deploy

1. No legacy data, no out-of-Prisma tables, no `_prisma_migrations` table.
2. You can run `bunx prisma migrate deploy` and all 14 migrations will succeed in order, because each destructive operation operates on tables that have no rows yet.
3. Skip to §5.

### Path B — prod DB already exists and contains tables this app expects

If any of the following is true on prod, **stop and read §4 before running anything**:

- `aggregator_offers` exists and has rows (migration #5 will need a backfill plan).
- `brand` exists with rows (migration #5 creates it `IF NOT EXISTS`, but the rows must be reachable from the existing `brand_name` values in `aggregator_offers`).
- `api_BOLT_header`, `api_BOLT_lines`, `bolt_company_mappings`, or `bolt_regex_patters` exist (migration #11 will fail with "relation already exists" — must be marked applied via `migrate resolve`).
- `bolt_company_mappings.bp_code` is already `DOUBLE PRECISION` (migration #13 is no-op-equivalent — fine).
- `_prisma_migrations` table exists with some rows (someone already started a Prisma history here — bring the team in before continuing).

Path B requires the per-migration handling in §4 below.

---

## 4. Per-migration handling (Path B specifics)

> For Path A, this whole section is informational — no changes needed.

### 4.1 Migration #5 — `link_aggregator_offers_to_brand` (HIGH RISK)

**What it does:**

```sql
CREATE TABLE IF NOT EXISTS "public"."brand" ( … );
ALTER TABLE public.aggregator_offers ADD COLUMN IF NOT EXISTS brand_id INTEGER;
ALTER TABLE public.aggregator_offers DROP COLUMN brand_name;          -- destructive
ALTER TABLE public.aggregator_offers ALTER COLUMN brand_id SET NOT NULL;
CREATE INDEX aggregator_offers_brand_id_idx ON public.aggregator_offers (brand_id);
ALTER TABLE public.aggregator_offers
  ADD CONSTRAINT aggregator_offers_brand_id_fkey
  FOREIGN KEY (brand_id) REFERENCES public."brand"(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

**Why this is dangerous on a non-empty prod:**

1. `DROP COLUMN brand_name` permanently removes data — it cannot be reversed once the migration completes.
2. `ALTER COLUMN brand_id SET NOT NULL` will **fail** if any row in `aggregator_offers` has `brand_id IS NULL` (which is every row immediately after the column is added, since the migration provides no backfill).

**Decision points before running:**

1. Does `aggregator_offers` exist on prod and have rows?
   - **No / 0 rows** → safe to apply as-is. Continue.
   - **Yes** → go to step 2.

2. Does `brand` already exist on prod with the rows that match the `brand_name` values in `aggregator_offers`?
   - **No** → you must populate `brand` first (insert the distinct brand names that exist in `aggregator_offers`).
   - **Yes** → continue.

3. Patch the migration with a backfill **between** the `ADD COLUMN brand_id` and the `DROP COLUMN brand_name` lines:

   ```sql
   -- Backfill brand_id from brand_name. Run ONLY if aggregator_offers has data.
   UPDATE public.aggregator_offers ao
   SET    brand_id = b.id
   FROM   public.brand b
   WHERE  b.name = ao.brand_name
     AND  ao.brand_id IS NULL;

   -- Verify no NULLs remain. This SELECT must return 0 before the SET NOT NULL.
   -- (If it returns >0 the migration will abort.)
   ```

4. Run a dry-run of the backfill manually in a transaction against a copy of prod (or the just-taken backup restored to a scratch DB) to confirm zero NULLs remain. Only then run the modified migration on prod.

> **Do not edit the migration file in place after it has been applied to any environment.** If you have to patch the SQL for prod, do it in a separate corrective migration committed to the repo, or apply the backfill manually with `psql` immediately before `migrate deploy` runs this migration. The team must sign off on whichever approach is chosen.

### 4.2 Migration #6 — `add_categories_subcategories` (Medium)

**What it does (relevant part):**

```sql
DROP INDEX "brand_slug_key";
```

This will fail with "index does not exist" if migration #5 was applied through some path that did **not** create `brand_slug_key`, or succeed cleanly if it did. On a freshly-applied #5, the index exists (`CREATE UNIQUE INDEX IF NOT EXISTS "brand_slug_key" …`), so on Path A this is fine.

If you hit this error on Path B, either:

- pre-create the index (`CREATE UNIQUE INDEX IF NOT EXISTS "brand_slug_key" ON "public"."brand"("slug");`) so the `DROP` succeeds, or
- patch the migration to `DROP INDEX IF EXISTS "brand_slug_key";` via a corrective migration.

### 4.3 Migration #11 — `baseline_bolt_tables` (HIGH RISK on Path B)

**What it does:** `CREATE TABLE` for `api_BOLT_header`, `api_BOLT_lines`, `bolt_company_mappings`, `bolt_regex_patters`. These tables were created **outside** Prisma in dev and were baselined into a migration after the fact (see `README.md` § _Reconciling drift_).

**If these tables already exist on prod** (which is likely if BOLT ingestion is already running there):

1. **Do not** let `migrate deploy` try to run this migration — it will fail with "relation already exists".
2. Mark it as already applied **before** running `migrate deploy`:

   ```bash
   bunx prisma migrate resolve --applied 20260526110000_baseline_bolt_tables
   ```

3. Re-run `bunx prisma migrate status` and confirm migration #11 now appears as applied.
4. Compare the actual prod schema against the SQL in `prisma/migrations/20260526110000_baseline_bolt_tables/migration.sql` (column types, FKs, primary keys). If anything differs:
   - small differences (FK action, column type) → migration #13 may already cover them; check §4.4.
   - large differences (missing tables, extra columns) → write a new corrective migration before continuing.

**If these tables do not exist on prod**, the migration runs as a normal `CREATE TABLE` and there is nothing special to do.

### 4.4 Migration #13 — `reconcile_bolt_drift` (Medium)

**What it does:**

```sql
ALTER TABLE "bolt_company_mappings"
  ALTER COLUMN "bp_code" TYPE DOUBLE PRECISION USING "bp_code"::double precision;

ALTER TABLE "api_BOLT_lines"
  DROP CONSTRAINT IF EXISTS "api_BOLT_lines_documentid_fkey";
ALTER TABLE "api_BOLT_lines"
  ADD CONSTRAINT "api_BOLT_lines_documentid_fkey"
  FOREIGN KEY ("documentid") REFERENCES "api_BOLT_header" ("documentid")
  ON UPDATE CASCADE ON DELETE CASCADE;
```

The migration's own header comments state both statements are idempotent / no-op when the DB already matches the target shape. In practice:

- The `ALTER COLUMN … TYPE DOUBLE PRECISION USING …::double precision` is safe even when the column is already `DOUBLE PRECISION`. It will rewrite the column though, which on a very large `bolt_company_mappings` would briefly take an `ACCESS EXCLUSIVE` lock. Check the row count before running:

  ```bash
  psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM bolt_company_mappings;"
  ```

  If this is in the millions, schedule the migration in a low-traffic window and consider running the `ALTER COLUMN` manually first with explicit `LOCK TIMEOUT`.

- The FK drop + recreate is fast and only takes a brief lock on `api_BOLT_lines`.

---

## 5. Apply

Once §2, §3, and (if Path B) §4 are all green:

1. **Stop or pause writers to the affected tables** for the duration of the migration. This app is read-mostly during migration, but if there is any background ingestion writing to `aggregator_offers`, `brand`, `api_BOLT_*`, or `bolt_company_mappings`, pause it.

2. Apply pending migrations using **`migrate deploy`** (never `migrate dev` against prod):

   ```bash
   bunx prisma migrate deploy
   ```

3. Regenerate the Prisma client on the host where the app actually runs, **only if** your build pipeline doesn't already bundle a generated client into the deploy artifact:

   ```bash
   bunx prisma generate
   ```

4. Re-enable any writers paused in step 1.

If `migrate deploy` fails partway through, **do not** re-run it blindly. The failed migration is recorded in `_prisma_migrations` with a `finished_at IS NULL` and `logs` populated. Read the logs, fix the cause (per §4), then either:

- mark the failed migration as rolled back so it is retried:

  ```bash
  bunx prisma migrate resolve --rolled-back <migration_name>
  ```

- or, if the failure left partial DDL behind, restore from the §2.3 backup before retrying.

---

## 6. Verify

1. Run `bunx prisma migrate status`. Expected output: **"Database schema is up to date"** with no pending migrations.

2. Spot-check the new schema with read-only queries:

   ```sql
   -- Core tables present
   SELECT to_regclass('public.aggregator_offers') AS aggregator_offers,
          to_regclass('public.brand')             AS brand,
          to_regclass('public.user_brand')        AS user_brand,
          to_regclass('public.dim_offers_audit')  AS dim_offers_audit,
          to_regclass('public."GeneratedImage"')  AS generated_image,
          to_regclass('public."BrandAsset"')      AS brand_asset;

   -- aggregator_offers no longer has brand_name, has brand_id NOT NULL with FK
   \d public.aggregator_offers

   -- BOLT FK is ON UPDATE CASCADE / ON DELETE CASCADE
   \d public."api_BOLT_lines"

   -- bp_code is double precision
   SELECT data_type FROM information_schema.columns
   WHERE table_name = 'bolt_company_mappings' AND column_name = 'bp_code';
   ```

3. Boot the app against prod with **read traffic only** if possible (e.g. a canary instance). Smoke test:
   - `/login` loads (Better Auth tables intact).
   - `/aggregator-offers` lists offers without throwing on `brand_name` (UI now uses `brand`).
   - `/admin/dim-offers` loads (audit table intact).
   - `/image-generator` loads, the `BrandAsset` and `GeneratedImage` tables accept the expected shape.

4. Confirm the app boots without warnings about missing image-generator providers if you set their API keys; missing keys are non-fatal but hide providers from the UI (see `.env.example`).

---

## 7. ClickHouse and uploads — out of scope for `migrate deploy`

Two things `migrate deploy` does **not** handle. Verify them separately:

- **ClickHouse** is a read-only analytics source for this app. The Prisma schema does not manage it. Confirm the prod ClickHouse has the tables this app reads — at minimum `transaction_details`, `dim_offers`, and whatever brand-alias view powers transaction filtering. The data team owns those schemas.
- **`UPLOADS_DIR`** must already be a writable persistent mount on the host. The app creates `images/` and `references/` under it lazily with mode `0700`. Reference images uploaded but never attached to a `GeneratedImage` are not garbage-collected — set up disk monitoring.

---

## 8. Rollback policy

Per `README.md`: **roll forward, not back.**

- If a problem appears after `migrate deploy` succeeds, write a **new** corrective migration. Do not edit a migration that has already been applied to any environment.
- Restore from the §2.3 backup only as a last resort, and only after writing down what state to bring back to (the backup is the pre-migration snapshot, so any data written between the backup and the restore is lost).
- Never `prisma migrate reset` on the prod database. Never `prisma db push` on the prod database. Both bypass migration history and will desync this app from every other environment.

---

## 9. Sign-offs required before running on prod

This deploy contains at least one destructive migration (#5 drops `aggregator_offers.brand_name`) and one baseline migration that may collide with existing tables (#11). Per `CLAUDE.md` / `AGENTS.md`, the following sign-offs are required:

- [ ] Backend lead — confirms migrations have been reviewed and the prod DB state in §2.4 has been classified as Path A or Path B.
- [ ] Data / analytics owner (only if Path B and `aggregator_offers` has rows) — confirms the `brand_name → brand_id` backfill plan in §4.1 is correct and approved.
- [ ] Ops / DBA — confirms the §2.3 backup exists, is verified non-empty, and is stored off-host.
- [ ] App owner — confirms maintenance window and that writers to affected tables will be paused per §5 step 1.

Only after all four boxes are checked should `bunx prisma migrate deploy` be run against prod.
