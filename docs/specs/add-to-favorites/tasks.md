# Add to Favorites / Monitor List — Task List

> Resumable implementation checklist. Add a cross-section "monitor list" to
> `/competition/restaurants`, backed by a generic per-user Postgres table.

## Context

`/competition/restaurants` shows competitor restaurants (from ClickHouse, keyed by
`processorId` + `restaurantId`). The only per-row personalization today is the existing
star **track/ignore** toggle in column 1 — that stays untouched.

This feature adds a **separate, generic "monitor list"**: a new `user_monitor` table keyed
by `(userId, section, entityId)` so it can hold items from any brand-related section
(`competition` now, `googleReviews` later). A new **bookmark** button at the _end_ of each
row adds the restaurant to the user's list; when already monitored the icon is colored, and
clicking it again asks for confirmation before removing.

### Confirmed decisions

- `entityId` is a **generic string** — `"${processorId}:${restaurantId}"` for competition;
  ready to hold a `businessCid` for Google Reviews later.
- `section` is a Prisma enum `MonitorSection { competition, googleReviews }`.
- Icon: **Bookmark** (`bookmark` outline = not monitored, `bookmark-check`
  filled/colored = monitored). Distinct from the column-1 star/bell.
- Adding = no confirmation; removing = AlertDialog confirm.

---

## Tasks

### 1. Database — Prisma model ✅

- [x] In `prisma/schema.prisma`, add enum `MonitorSection { competition, googleReviews }`.
- [x] Add model `user_monitor`:
  - `id String @id @default(cuid())`, `userId String`, `user` relation
    (`onDelete: Cascade`), `section MonitorSection`, `entityId String`,
    `createdAt DateTime @default(now())`.
  - `@@unique([userId, section, entityId])`, `@@index([userId, section])`.
  - Style-match `competition_user_restaurant_pref` (~lines 572-584).
- [x] Add back-relation `monitor_entries user_monitor[]` to the `user` model.
- [x] Run migration (NOT `db push`): `bunx prisma migrate dev --name add_user_monitor`
      (`20260608103745_add_user_monitor`; client regenerated).

### 2. Service — `src/lib/services/user-monitor.server.ts` (new) ✅

- [x] `getMonitoredEntityIds(userId, section)` → `Set<string>` of `entityId`s.
- [x] `addMonitor(userId, section, entityId)` → `upsert` on the composite unique key.
- [x] `removeMonitor(userId, section, entityId)` → `deleteMany` on `{ userId, section, entityId }`.
- [x] Used a local `MonitorSectionValue = "competition" | "googleReviews"` union
      (matches the app convention of hand-defined unions like `CompetitionTrackStateValue`,
      structurally assignable to the generated Prisma enum). Mirrors
      `competition/preferences.server.ts`.

### 3. Page server — `src/routes/competition/restaurants/+page.server.ts` ✅

- [x] Import the new service; add `getMonitoredEntityIds(user.id, "competition")` to the
      existing `Promise.all` in `load`.
- [x] When mapping `restaurantsPage.items`, attach
      `isMonitored: monitoredIds.has(`${restaurant.processorId}:${restaurant.id}`)`.
      (Also added `isMonitored: boolean` to `CompetitionRestaurantRow` in `competition.ts`
      and a `false` default in `restaurants.server.ts`, mirroring `trackState`.)
- [x] Add `addMonitor` action — guarded, Zod-validated `{ entityId }`, calls `addMonitor(...)`.
- [x] Add `removeMonitor` action — same guard/validation, calls `removeMonitor(...)`.

### 4. UI — confirm dialog primitive ✅

- [x] Added shadcn AlertDialog via `bunx shadcn-svelte@latest add alert-dialog -y -o`
      → `src/lib/components/ui/alert-dialog/`. The CLI also re-pulled its `button`
      dependency; the repo's customized `button` was backed up and restored (no diff).

### 5. UI — monitor toggle component ✅

- [x] New `src/lib/components/competition/monitor-toggle-button.svelte`.
  - Props: `entityId: string`, `isMonitored: boolean`. Local `confirmOpen = $state(false)`.
  - **Not monitored:** `<form method="POST" action="?/addMonitor" use:enhance>` + hidden
    `entityId` + ghost submit button with outline `BookmarkIcon` (muted), in a `Tooltip`.
  - **Monitored:** colored `BookmarkCheckIcon` button (`fill-primary text-primary`)
    whose `onclick` opens the AlertDialog. Confirm = a `?/removeMonitor` form with
    `use:enhance` that closes the dialog after `update()`.
  - `use:enhance` (default `invalidateAll`) so `isMonitored` refreshes from `load`.

### 6. UI — wire into the table (`+page.svelte`) ✅

- [x] Import `MonitorToggleButton`.
- [x] Add trailing `<Table.Head class="w-12"></Table.Head>` after the `Delivery` head.
- [x] Add trailing `<Table.Cell>` after the Delivery cell:
      `<MonitorToggleButton entityId={`${row.processorId}:${row.id}`} isMonitored={row.isMonitored} />`.
- [x] Bump empty-state `colspan` from `sortableColumns.length + 2` → `+ 3`.

### 7. Quality gates ✅

- [x] `bun run svelte-autofixer` passes (reformatted the new files).
- [x] Typecheck (`bun run check`): no errors/warnings in any changed file. The one
      pre-existing error is in `text-providers/openai.server.test.ts` (untouched).
- [ ] `gitnexus_detect_changes()` before commit (run when committing — not committed yet).

---

## Verification (e2e)

1. Migration succeeds; `user_monitor` table + `MonitorSection` enum exist.
2. On `/competition/restaurants`: bookmark button at row end, outline/muted by default.
3. Click → monitored, icon fills/colors; `user_monitor` row exists
   (`section='competition'`, `entityId='<processorId>:<restaurantId>'`).
4. Click colored icon → confirm dialog → confirm removes (icon reverts, DB row gone);
   cancel changes nothing.
5. Reload → state persists from `load`.
6. Existing column-1 star track toggle still works unchanged.

---

## Critical files

| File                                                          | Change                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------- |
| `prisma/schema.prisma`                                        | `MonitorSection` enum + `user_monitor` model + `user` back-relation |
| `prisma/migrations/…_add_user_monitor/`                       | Generated by `migrate dev`                                          |
| `src/lib/services/user-monitor.server.ts`                     | **New** — get/add/remove helpers                                    |
| `src/routes/competition/restaurants/+page.server.ts`          | `load` augmentation + `addMonitor`/`removeMonitor` actions          |
| `src/lib/components/competition/monitor-toggle-button.svelte` | **New** — button + confirm dialog                                   |
| `src/lib/components/ui/alert-dialog/**`                       | **New** — shadcn CLI                                                |
| `src/routes/competition/restaurants/+page.svelte`             | New column head + cell + colspan bump                               |
