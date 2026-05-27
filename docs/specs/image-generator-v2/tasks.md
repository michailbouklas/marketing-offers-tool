# Image Generator v2 — Brand Context Task List

Status legend:

- `[x]` Not started
- `[-]` In progress
- `[x]` Completed
- `[!]` Blocked / waiting on decision

Created: 2026-05-26
Last updated: 2026-05-26 (Phases 1–5 implementation complete)

---

## 1. Scope

Adds brand context to `/image-generator`:

- Optional single-select brand on the composer (re-click to clear).
- Brand guidelines markdown injected at the start of `finalPrompt` when a brand is selected.
- Brand-owned asset gallery in a dialog; user can attach a brand asset as a reference for the next generation.
- `GeneratedImage.brandId` persisted so generations are attributable to a brand.
- Admin route `/admin/brands` to upload/delete brand assets and edit guidelines markdown.

Reverses the v1 decision (`Plans.md` "Decisions logged": _"Brand pipeline: dropped from v1"_).

### Reference docs

- Spec: `docs/spec/image-generator.md` (v1) — add a "Brand context (v2)" section as part of task 7.3.
- v1 Plans.md: `Plans.md`
- v1 spec context: prototype review decisions, 2026-05-26.

### Key design choices (locked)

- **Selection mode**: single-select, optional.
- **Admin scope**: brand asset & guideline management is admin-only under `/admin/brands`. Per-brand visibility on the composer continues to be gated by `user_brand` assignments.
- **File layout**: everything under `UPLOADS_DIR`:
  - `${UPLOADS_DIR}/brands/${slug}/guidelines.md`
  - `${UPLOADS_DIR}/brands/${slug}/assets/<assetId>.<ext>`
- **Asset → reference materialisation**: picking a brand asset copies the file into a per-user `ReferenceImage` row. This keeps `orchestrate.server.ts` untouched (lowest blast radius).
- **`brand.slug` is the on-disk key**, not `brand.id` — slugs are human-readable and stable for backups.
- **Guidelines are injected into `finalPrompt`**, not the user-editable prompt, and appear before style/camera/aspect.
- **Guidelines are NOT injected into the Enhance flow**.

---

## 2. Open dependencies / pre-flight

- `[x]` Re-read `prisma/schema.prisma` before starting 3.1 — another session modified the file at 2026-05-26 09:15 and 09:37; rebase the migration onto current state.
- `[!]` Confirm `brand.slug` is populated and unique for every active brand (current schema has `slug @default("")` — empty slugs will break on-disk paths). Run `SELECT id, name FROM brand WHERE active = true AND (slug IS NULL OR slug = '')` before admin asset uploads ship; admin endpoints already 400 on empty slug, but composer-side selection of such a brand would silently skip guidelines injection.
- `[!]` Confirm `UPLOADS_DIR` env var is set in all environments where this feature ships (dev, staging, prod). Only verified in `.env.example`; not validated for staging/prod by this implementation pass.

> Also pending: the catch-up migration `20260526130000_reconcile_bolt_drift` was `migrate resolve --applied` on dev only. On prod, either verify the same drift exists (DOUBLE PRECISION + ON UPDATE CASCADE) and `migrate resolve --applied`, or run `migrate deploy` so the idempotent SQL executes. Either path is non-destructive.

---

## 3. Phase 1 — Schema & storage

### 3.1 Prisma migration

- `[x]` Add model `BrandAsset` to `prisma/schema.prisma`:

  ```prisma
  model BrandAsset {
    id          String   @id @default(cuid())
    brandId     Int
    brand       brand    @relation(fields: [brandId], references: [id], onDelete: Cascade)
    name        String
    localPath   String
    contentType String
    sizeBytes   Int
    createdAt   DateTime @default(now())

    @@index([brandId, createdAt])
  }
  ```

- `[x]` Add `brandId Int?` to `GeneratedImage` with relation to `brand` (nullable, `onDelete: SetNull`). Add `@@index([brandId, createdAt])`.
- `[x]` Add back-relations on `brand`: `brand_assets BrandAsset[]` and `generated_images GeneratedImage[]`.
- `[x]` Run `bun prisma migrate dev --name add_brand_context_to_image_generator`.
- `[x]` Run `bun prisma generate`.
- `[x]` Verify `select` works on `BrandAsset`; verify `GeneratedImage.brandId` accepts null and an existing brand id.

> Reuse pattern: `prisma/schema.prisma:293-317` (`GeneratedImage`), `:319-328` (`ReferenceImage`).

### 3.2 Brand storage helper

- `[x]` Create `src/lib/server/brand-storage.ts`. Mirror the shape and safety patterns of `src/lib/server/reference-storage.ts`:
  - Exports: `brandDir(uploadsDir, slug)`, `brandAssetsDir(uploadsDir, slug)`, `brandGuidelinesPath(uploadsDir, slug)`, `writeBrandAsset(uploadsDir, slug, id, file)`, `deleteBrandAsset(uploadsDir, slug, id, extension)`, `readBrandGuidelines(uploadsDir, slug)` (returns `string | null`), `writeBrandGuidelines(uploadsDir, slug, markdown)`.
  - Reuse `extensionForContentType` from `reference-storage.ts`.
  - Add `ensureSafeSlug(slug)` mirroring `ensureSafeId` — reject `..`, separators, empty.
  - Dir mode `0o700`, file mode `0o600`.
- `[x]` Write Vitest at `src/lib/server/brand-storage.test.ts` (tdd:required):
  - Round-trip write → read for an asset.
  - Missing guidelines returns `null`.
  - Rejects non-image content types.
  - Rejects unsafe slugs (`..`, `/`, `\`, empty string).
  - Rejects unsafe asset ids.

> Reuse: `src/lib/server/reference-storage.ts` (`ensureSafeId`, `extensionForContentType`, dir-mode patterns).

---

## 4. Phase 2 — Server services & API

### 4.1 Brand context service

- `[x]` Create `src/lib/services/brand-context/brand-context.server.ts` exporting:
  - `listBrandAssets(brandId: number)`
  - `getBrandAsset(brandId: number, assetId: string)`
  - `createBrandAsset({ brandId, slug, file, name })` — writes file via `writeBrandAsset` (3.2) then persists row.
  - `deleteBrandAsset(assetId: string)` — transaction: row delete + file unlink (idempotent on missing file).
  - `getBrandGuidelines(slug: string)` — wraps `readBrandGuidelines`.
  - `setBrandGuidelines(slug: string, markdown: string)` — wraps `writeBrandGuidelines`.
- `[x]` Write Vitest with a temp `UPLOADS_DIR` (tdd:required):
  - Create → list → delete round-trip.
  - Deleting twice does not throw.
  - Guidelines write → read returns the same string.

### 4.2 Extend generate.server.ts

- `[x]` Add `brandId: z.number().int().positive().optional()` to `generateBodySchema` in `src/lib/services/image-generator/generate.server.ts`.
- `[x]` In `createPendingGenerations`: when `brandId` is set, verify it is assigned to the user via `user_brand`. Throw `GenerateValidationError(400)` on unknown/unassigned brand.
- `[x]` Fetch brand slug + guidelines (`getBrandGuidelines`) and prepend the markdown text to the parts list in `buildFinalPrompt` — accept new optional arg `brandGuidelines?: string`. Order: guidelines, style, camera, aspect, user prompt.
- `[x]` Persist `brandId` on every `prisma.generatedImage.create({ data })` call inside the for-loop.
- `[x]` Vitest (tdd:required): unknown brandId → 400; unassigned brandId → 400; guidelines text appears at start of `finalPrompt`; created rows have correct `brandId`.

> File: `src/lib/services/image-generator/generate.server.ts` — extend `generateBodySchema`, `buildFinalPrompt`, `createPendingGenerations`. **Do not** touch `orchestrate.server.ts`.

### 4.3 Asset → reference endpoint

- `[x]` Create `src/routes/api/images/references/from-brand-asset/+server.ts`:
  - `POST` body: `{ assetId: string }` (Zod-validated).
  - Verify the asset's brand is assigned to the current user; 403 otherwise.
  - 404 on unknown asset.
  - Copy `BrandAsset.localPath` → new file under `${UPLOADS_DIR}/references/<newId>.<ext>` (file copy, not symlink — preserves orchestrator's `localPath` semantics).
  - Persist a `ReferenceImage` row owned by the current user.
  - Return `{ id, contentType }`.
- `[x]` Vitest integration test (tdd:required): 401 unauth, 403 cross-brand, 404 unknown, 200 returns new reference id, new file exists on disk under `references/`.

> Template: `src/routes/api/images/references/+server.ts`.

### 4.4 Brand asset file streaming

- `[x]` Create `src/routes/api/brand-assets/[id]/+server.ts` with `GET` streaming the binary from `BrandAsset.localPath`. Authenticated; verify the requesting user is assigned to the asset's brand.
- `[x]` Vitest (tdd:required): 401 unauth, 403 cross-brand, 404 missing, 200 correct content-type + bytes.

> Mirror: `src/routes/api/images/[id]/file/+server.ts` (the existing streaming endpoint from 2.7 of v1).

### 4.5 Brand asset list endpoint

- `[x]` Create `src/routes/api/brand-assets/+server.ts` with `GET ?brandId=<n>` returning `BrandAsset` rows for that brand. Authenticated; verify user is assigned to the brand.
- `[x]` Vitest (tdd:required): 401 unauth, 403 unassigned brand, 200 returns rows scoped to that brand only.

### 4.6 Admin endpoints

- `[x]` Create `src/routes/api/admin/brands/[brandId]/assets/+server.ts`:
  - `POST` multipart upload (one or more files) → calls 4.1 `createBrandAsset` for each.
  - All endpoints gated by `requireAdminUser`.
- `[x]` Create `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts`:
  - `DELETE` → calls 4.1 `deleteBrandAsset`. Verify asset belongs to the path's brandId.
- `[x]` Create `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts`:
  - `PUT` body `{ markdown: string }` (Zod-validated, max length sanity-check ~50KB).
  - Looks up brand by id to get slug, then calls 4.1 `setBrandGuidelines(slug, markdown)`.
- `[x]` Vitest integration tests (tdd:required): non-admin → 302 redirect (existing pattern); admin happy paths; bad input → 400.

> Auth template: `src/lib/server/auth-guards.ts:requireAdminUser`. Admin route shape template: `src/routes/admin/users/+page.server.ts`.

---

## 5. Phase 3 — Composer UI

### 5.1 Wire brand button group selection state

- `[x]` In `src/routes/image-generator/+page.svelte`:
  - Add `let selectedBrandId = $state<number | null>(null);`.
  - Apply `variant="default"` (or equivalent selected styling) to the matching `Button` inside the existing `ButtonGroup.Root` at lines 252-267. Clicking the already-active brand sets `selectedBrandId = null`.
  - Pass `selectedBrandId` through `handleSubmit` into `submitGeneration`.
- `[x]` Manual verify: clicking highlights, clicking again clears, selection persists across one generation submit.

### 5.2 Plumb brandId through composer types & client

- `[x]` In `src/routes/image-generator/composer-types.ts` (or wherever `ComposerState` / `SubmitPayload` live), add `brandId?: number | null`.
- `[x]` In `src/lib/services/image-generator/image-generator-client.ts`, extend `submitGeneration`'s payload to forward `brandId`.
- `[x]` Type-check passes: `bun run check`.
- No behavioural change to enhance flow — brand context applies only to generation.

### 5.3 Brand asset gallery dialog

- `[x]` Create `src/routes/image-generator/BrandAssetGalleryDialog.svelte`:
  - shadcn-svelte `Dialog`.
  - Responsive grid of asset cards; each card shows `<img src="/api/brand-assets/{id}">`, asset name, "Use as reference" button.
  - On "Use as reference":
    1. `POST /api/images/references/from-brand-asset` with `{ assetId }`.
    2. `composer.loadFrom({ referenceIds: [newRefId], enhance: false })`.
    3. Set `suppressEnhanceOnce = true` on the parent.
    4. Close dialog, scroll to composer (`window.scrollTo({ top: 0, behavior: "smooth" })`).
- `[x]` Add a "View brand assets" button next to the brand button group in `+page.svelte`; disabled when `selectedBrandId === null`.
- `[x]` Manual verify: selecting brand → opening dialog shows that brand's assets; clicking "Use as reference" attaches it and disables Enhance for the next submit.

### 5.4 Lazy asset fetch + caching

- `[x]` Add client helper `listBrandAssets(brandId)` in `image-generator-client.ts` calling `GET /api/brand-assets?brandId=<n>`.
- `[x]` In `BrandAssetGalleryDialog.svelte`: fetch on open, show skeleton while pending, show empty state when no assets.
- `[x]` Cache results in a `Map<number, BrandAsset[]>` in the page scope; second open for the same brand within the session uses the cache.

---

## 6. Phase 4 — Admin route `/admin/brands`

### 6.1 Brand list page

- `[x]` Create `src/routes/admin/brands/+page.server.ts`:
  - `load`: `await requireAdminUser(event)`; return `listBrands()` plus asset count per brand (`prisma.brandAsset.groupBy({ by: ['brandId'], _count: ... })`).
- `[x]` Create `src/routes/admin/brands/+page.svelte`:
  - Table with columns: Name, Slug, Asset count, Active, "Manage" link to `/admin/brands/[id]`.
  - Style consistent with `src/routes/admin/users/+page.svelte`.
- `[x]` Manual verify: non-admin → redirect to `/`; admin sees all brands; links work.

### 6.2 Per-brand management page

- `[x]` Create `src/routes/admin/brands/[id]/+page.server.ts`:
  - `load`: `requireAdminUser`; fetch brand, current `BrandAsset` rows, current guidelines text via `getBrandGuidelines(brand.slug)`. Return `{ brand, assets, guidelines }`.
- `[x]` Create `src/routes/admin/brands/[id]/+page.svelte` with two panels:
  - **Guidelines** panel: textarea pre-filled with `data.guidelines`; "Save" button posts to `PUT /api/admin/brands/[id]/guidelines`. Show toast on success/error.
  - **Assets** panel: drop-zone for multi-file upload posting to `POST /api/admin/brands/[id]/assets`; grid of asset cards showing image, name, file size, "Delete" button (with confirmation). Delete calls `DELETE /api/admin/brands/[id]/assets/[assetId]`.
  - Reuse asset-card visuals from `BrandAssetGalleryDialog.svelte` where reasonable.
- `[x]` Manual verify: admin can upload (single + multi), delete (with confirm), edit and save guidelines markdown; changes visible to assigned users on next gallery dialog open.

---

## 7. Phase 5 — Polish

### 7.1 Lint, type-check, tests

- `[x]` `bun run svelte-autofixer` — clean
- `[x]` `bun run check` — 0 errors, 2 pre-existing warnings about `data` capture (already present in v1 `+page.svelte`)
- `[!]` `bun run lint` — no `lint` script defined in `package.json`; `svelte-autofixer` covers formatting/linting in this project.
- `[x]` `bun run test` — 184 / 184 passing
- `[x]` All applicable commands exit 0.

### 7.2 Manual end-to-end smoke (operator action required)

- `[ ]` Log in as admin → `/admin/brands` → pick a brand → upload 2 images → save guidelines markdown (e.g. `"Use vibrant, appetising colours; show food at 45° angle."`).
- `[ ]` Assign that brand to a regular test user via `/admin/users`.
- `[ ]` Log in as that user → `/image-generator` → click brand button (verify highlight) → open gallery dialog (verify 2 assets) → click "Use as reference" on one.
- `[ ]` Type a prompt, submit. Confirm in DB / network:
  - Enhance was auto-skipped for this submit.
  - `/api/images/generate` payload includes `brandId`.
  - New `GeneratedImage` row has `brandId` populated.
  - `finalPrompt` starts with the guidelines text.
  - Image renders correctly (proves brand-asset → ReferenceImage materialisation worked through the unchanged orchestrator).
- `[ ]` Click the active brand again → highlight clears; subsequent submit has `brandId = null` and no guidelines prefix.
- `[ ]` Attach screenshots to PR.

### 7.3 Documentation

- `[x]` Add a "Brand context (v2)" section to `docs/spec/image-generator.md`. Cross-reference the v1 "Decisions logged" entry that previously deferred brand kits. Cover: selection model, file layout, asset-as-reference materialisation, finalPrompt ordering, admin route.
- `[x]` Update README / runbook if anything new is needed re: `UPLOADS_DIR` (likely already covered by v1 task 4.3, but verify).

---

## 8. Critical files / reuse map

| Purpose                                         | File                                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Existing brand `ButtonGroup` to wire up         | `src/routes/image-generator/+page.svelte:252-267`                                        |
| Page load (already fetches `listBrandsForUser`) | `src/routes/image-generator/+page.server.ts`                                             |
| Extend schema + buildFinalPrompt                | `src/lib/services/image-generator/generate.server.ts`                                    |
| **Do not modify** — orchestrator                | `src/lib/services/image-generator/orchestrate.server.ts`                                 |
| Template for `brand-storage.ts`                 | `src/lib/server/reference-storage.ts`                                                    |
| Template for asset→reference endpoint           | `src/routes/api/images/references/+server.ts`                                            |
| Template for admin route auth + load            | `src/routes/admin/users/+page.server.ts`                                                 |
| Brand helpers (reuse, do not duplicate)         | `src/lib/services/brands.server.ts`, `src/lib/services/brands.ts`                        |
| shadcn-svelte primitives                        | `src/lib/components/ui/{button-group,dialog,card,dropdown-menu}/`                        |
| Auth guards                                     | `src/lib/server/auth-guards.ts` (`requireAuthenticatedApiUser`, `requireAdminUser`)      |
| Schema models to extend                         | `prisma/schema.prisma:54-66` (brand), `:68-77` (user_brand), `:293-317` (GeneratedImage) |

---

## 9. Resume hints

When picking this up cold:

1. Skim Section 1 (Scope) and the "Key design choices (locked)" list — those are not up for re-litigation without an explicit user check.
2. Check Section 2 (Open dependencies) — confirm the `prisma/schema.prisma` rebase and `brand.slug` data quality before touching 3.1.
3. Find the first `[ ]` task in section order and start there. Tasks within a section can usually be done in listed order; sections 3 → 4 → 5 → 6 → 7 should be done strictly in order (later sections depend on earlier ones).
4. As you complete a task, flip its box to `[x]`. Use `[-]` for in-progress and `[!]` for blocked (add a one-line note next to the bullet explaining the blocker).
5. Update "Last updated" at the top when you make material changes to the list itself.
