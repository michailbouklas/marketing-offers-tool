# marketing-offers-tool

SvelteKit + TypeScript tool for marketing teams to register and manage aggregator offers (Wolt, Bolt, etc.) and track offer performance against aggregator invoices.

See [`CLAUDE.md`](./CLAUDE.md) and [`AGENTS.md`](./AGENTS.md) for the full project rules.

## Developing

```bash
bun install
bun run dev
```

Then open the URL printed in the terminal (default `http://localhost:5173`).

Other useful scripts:

```bash
bun run check            # svelte-kit sync + svelte-check
bun run test             # vitest run
bun run svelte-autofixer # prettier --write .
bun run build            # production build
```

## Building

```bash
bun run build
bun run preview
```

> Production deploys run the Node adapter output (`build/`). Set the env vars listed in `.env.example` on the host before starting.

### Image-generator uploads (`UPLOADS_DIR`)

The Image Generator persists generated and reference images on the filesystem at `${UPLOADS_DIR}/images/` and `${UPLOADS_DIR}/references/`. In dev `UPLOADS_DIR` defaults to `./uploads` (gitignored), but **in production it must point at a persistent volume mount** — generated images are referenced by ID from the database, so the directory has to survive container/pod restarts and ideally back up alongside the DB.

Operational notes:

- The path is read at runtime via `$env/dynamic/private`, so it can be overridden per deploy without rebuilding.
- The server creates `images/` and `references/` lazily with mode `0700`; the parent `UPLOADS_DIR` itself must already exist and be writable by the Node process user.
- Reference images uploaded but never attached to a `GeneratedImage` are not garbage-collected in v1 — monitor disk usage and add a sweep job if it grows unbounded.
- If you swap `UPLOADS_DIR` you must migrate the existing files; the DB stores the full path on `GeneratedImage.localPath` / `ReferenceImage.localPath`, so a path change requires either a backfill or keeping the old volume mounted at the old path.

## Database migrations

> **Read this before touching the production DB.** Migrations are managed by Prisma 7. The project rule (`CLAUDE.md`) is: **never `db push`, always `migrate`; never destructive migrations without team sign-off.**

### Local development

For your own dev DB pointed at by `DATABASE_URL`, the normal Prisma loop applies:

```bash
bunx prisma migrate dev --name <descriptive_name>   # creates + applies on a dev DB
bunx prisma generate                                # regenerate client
bunx prisma migrate status                          # show pending vs applied
```

If `migrate dev` reports **drift** (tables or columns in the DB that are not in any migration), it will offer to reset the DB. **Do not accept the reset on a shared or production DB.** Reconcile the drift first — see "Reconciling drift" below.

### Production / shared DB — safe migration workflow

Use a checklist, not muscle memory. Each step is reversible until the last.

1. **Snapshot the DB.** Take a logical dump before any schema change:

   ```bash
   pg_dump --format=custom --no-owner --no-privileges \
     --file=backup-$(date +%Y%m%d-%H%M).dump "$DATABASE_URL"
   ```

   Verify the file is non-empty and store it off-host.

2. **Confirm the migration history is in sync.** Against the production `DATABASE_URL`:

   ```bash
   bunx prisma migrate status
   ```

   You want to see "Database schema is up to date" plus an explicit list of pending migrations. If the output includes "Drift detected" or "following migration(s) have not yet been applied", investigate before continuing.

3. **Review the SQL.** Open every pending migration under `prisma/migrations/<timestamp>_<name>/migration.sql` and confirm:
   - No `DROP TABLE`, `DROP COLUMN`, or `ALTER ... DROP` unless explicitly signed off.
   - No `ALTER TYPE ... RENAME` or enum value removals on an in-use enum.
   - Indexes added on large tables use `CONCURRENTLY` (you may need to edit by hand — Prisma does not emit it).
   - Backfills are idempotent and bounded (no `UPDATE big_table SET col = ...` without a `WHERE`).

4. **Apply with `migrate deploy`, not `migrate dev`.** `migrate deploy` is the production-safe command: it only applies pending migrations and never tries to reset or generate new ones.

   ```bash
   bunx prisma migrate deploy
   ```

5. **Verify.** Re-run `bunx prisma migrate status` (expect "Database schema is up to date"). Spot-check the new tables/columns with read-only queries before promoting the app.

6. **Roll forward, not back.** If something is wrong post-deploy, write a **new** corrective migration. Do not edit a deployed migration file. Restore from the snapshot only as a last resort.

### Reconciling drift

If the live DB has tables Prisma doesn't know about (e.g. a schema change made directly in `psql`), baseline them before applying anything else:

1. Inspect the live schema **without** writing back to `schema.prisma`:

   ```bash
   bunx prisma db pull --print > /tmp/live-schema.prisma
   ```

2. Add the missing models to `prisma/schema.prisma`.

3. Hand-write a migration directory under `prisma/migrations/<timestamp>_baseline_<thing>/migration.sql` containing the `CREATE TABLE` (and indexes / FKs) for those drifted tables.

4. Tell Prisma the baseline is already applied (no SQL is executed):

   ```bash
   bunx prisma migrate resolve --applied <timestamp>_baseline_<thing>
   ```

5. Now `migrate status` should be clean. Apply your real migration with `migrate deploy`.

### Things to never do without team sign-off

- `prisma migrate reset` on any DB other than your personal dev DB.
- `prisma db push` (bypasses migration history).
- Editing an already-applied migration file under `prisma/migrations/`.
- `DROP TABLE`, `DROP COLUMN`, or any destructive `ALTER` in a migration.
- Renaming a table or column without a two-step expand → contract.

## Stack

- SvelteKit (Svelte 5 runes), TypeScript
- Tailwind CSS v4 (no `tailwind.config.js`)
- shadcn-svelte (bits-ui primitives)
- sveltekit-superforms + Zod
- better-auth (PostgreSQL adapter + admin plugin)
- Prisma 7 / PostgreSQL
- ClickHouse (analytics)
- Bun for package management
