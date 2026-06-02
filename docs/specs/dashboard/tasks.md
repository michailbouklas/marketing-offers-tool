# Role-Aware Home Dashboard — Task List

Resumable implementation checklist. Check off `[x]` as each task completes. Each task names the files to touch and the acceptance signal.

## Context

The home page (`src/routes/+page.svelte`) shows the same content to everyone today. We are making it **role-aware**: each user sees widgets relevant to the roles they hold; multi-role users see the union; `superUser` sees everything.

Role → widget mapping:

- **approver** → approvals widget (pending count + link to `/admin/pending-submissions`)
- **userManager** → users widget (user count + link to `/admin/users`)
- **usageViewer** → compact image-gen usage stat cards + link to `/admin/image-generator-usage`
- **offerEditor** _(new role)_ → the existing three offer-lifecycle widgets
- no relevant role → graceful empty/welcome state

Decisions locked: `offerEditor` **also gates editing** on `/aggregator-offers`; usage widget is **compact stat cards + link** (no charts). No Prisma migration (`user.role` is a comma-separated string).

Pattern to mirror: `src/routes/admin/+page.server.ts` (parallel `hasPermission` flags) + `src/routes/admin/+page.svelte` (conditional render). Roles/permissions are shared server+client via `src/lib/auth/permissions.ts`.

---

## Phase 1 — Role + permission

- [x] **1.1 Add `offerEditor` to roles** — `src/lib/auth/roles.ts`
  - Added `"offerEditor"` to the `userRoles` tuple and `offerEditor: "Offer Editor"` to `roleLabels`.
- [x] **1.2 Add `offer:edit` permission** — `src/lib/auth/permissions.ts`
  - Added `offer: ["edit"]` to `statement`, `offerEditor` role, and `superUser`. `satisfies Record<UserRole, Role>` typechecks.
- [x] **1.3 Verify role-assignment UI auto-includes it**
  - Confirmed `userRoleOptions = userRoles` in `user-editor-form.ts` — "Offer Editor" appears automatically.
- [x] **1.4 Confirm shared auth config still compiles** — `bun run check` → 0 errors.

**Acceptance:** typecheck passes; "Offer Editor" appears in the user editor role checkboxes.

## Phase 2 — Gate offer mutations behind `offer:edit`

- [x] **2.1 Server guards** — `src/routes/aggregator-offers/+page.server.ts`
  - `createOffer`/`updateOffer` now call `await requirePermission(event, { offer: ["edit"] })`. `load` keeps `requireAuthenticatedUser` and returns `canEditOffers`.
- [x] **2.2 Hide create/edit affordances** — `src/routes/aggregator-offers/+page.svelte`
  - "Create Offer" dialog wrapped in `{#if data.canEditOffers}`; `onEdit={data.canEditOffers ? openEditOfferDialog : undefined}`. No change to `offers-table.svelte`.

**Acceptance:** non-editor sees offers but no Create/Edit buttons; direct POST to `?/createOffer`/`?/updateOffer` redirects.

## Phase 3 — Count helpers (server services)

- [x] **3.1 `countUsers()`** — `src/lib/services/users.server.ts` → `prisma.user.count()`.
- [x] **3.2 `getPendingGapSubmissionCount()`** — `src/lib/services/offers-data-quality.server.ts`
  - Wraps new `countPendingStagingRecords()` in `offers-data-quality-postgres.server.ts` (`dim_offers_staging.count({ where: { status: "pending" } })`).

**Acceptance:** both functions return correct counts when called.

## Phase 4 — Role-aware home page

- [x] **4.1 Role-aware `load`** — `src/routes/+page.server.ts`
  - Keep `requireAuthenticatedUser(event)`.
  - Compute four flags in parallel via `hasPermission` (mirror `admin/+page.server.ts`):
    - `canEditOffers` → `{ offer: ["edit"] }`
    - `canApprove` → `{ submission: ["approve"] }`
    - `canManageUsers` → `{ user: ["list"] }`
    - `canViewUsage` → `{ imageGenerator: ["view-usage"] }`
  - Conditionally load only what's visible:
    - offers: `getHomeOfferWidgets()` (`src/lib/services/home-offer-widgets.ts`) when `canEditOffers`
    - approvals: `getPendingGapSubmissionCount()` when `canApprove`
    - users: `countUsers()` when `canManageUsers`
    - usage: `getAdminImageUsageOverview()` summary (`…/image-generator/image-generator.server.ts`, `summary.{totalImages,totalUsers,completed,failed}`) when `canViewUsage`
  - Return:
    ```ts
    return {
      userRole,
      access: { canEditOffers, canApprove, canManageUsers, canViewUsage },
      offers: canEditOffers ? widgets : null,
      approvals: canApprove ? { pendingCount } : null,
      users: canManageUsers ? { userCount } : null,
      usage: canViewUsage ? { summary } : null,
    };
    ```
- [x] **4.2 `metric-link-card.svelte`** — created (used by Approvals + Users widgets).
- [x] **4.3 `usage-summary-widget.svelte`** — created (four stat cards + link).
- [x] **4.4 Rebuild page render** — `src/routes/+page.svelte`
  - Keep the hero/header (generic welcome).
  - Render role-conditional sections in order when flag set:
    - Offers (`access.canEditOffers`): three `OfferStatusWidget` cards from `data.offers.{activeOffers,expiringSoon,recentlyExpired}` (component unchanged).
    - Approvals (`access.canApprove`): `MetricLinkCard` → `/admin/pending-submissions`.
    - Users (`access.canManageUsers`): `MetricLinkCard` → `/admin/users`.
    - Usage (`access.canViewUsage`): `UsageSummaryWidget`.
    - Empty state (no flags): friendly "no widgets for your roles yet — ask an administrator" message styled like `admin/+page.svelte` no-access copy.
  - Remove the old hardcoded `adminQuickCards` block.

**Acceptance:** each role sees exactly its widgets; multi-role sees union; plain user sees empty state.

## Phase 5 — Verify

- [x] **5.1** `bun run svelte-autofixer` — clean.
- [x] **5.2** `bun run check` → 0 errors (3 pre-existing unrelated warnings).
- [ ] **5.3** Dev server manual run across role combos (**needs user — requires logging in as users holding each role**):
  - offerEditor only → 3 offer widgets; can create/edit on `/aggregator-offers`
  - approver only → approvals widget w/ correct pending count; offer buttons hidden
  - userManager only → users widget w/ correct user count
  - usageViewer only → 4 usage stat cards matching `/admin/image-generator-usage`
  - multi-role (e.g. `approver,userManager`) → both widgets
  - plain `user` → empty state, no offer buttons
  - superUser → all widgets
- [ ] **5.4** Negative check: non-offerEditor POSTing directly to `?/createOffer`/`?/updateOffer` is redirected (not just UI-hidden).

> Project rule: before editing `requireAuthenticatedUser`, the offer actions, or `getHomeOfferWidgets`, run `gitnexus_impact` and report HIGH/CRITICAL blast radius.

---

## Progress log

_(Append notes here when pausing so work can resume cleanly.)_

- **Phases 1–4 complete; 5.1–5.2 (autofixer + typecheck) green.** Remaining: manual role-combination smoke test (5.3) and the direct-POST negative check (5.4), both of which need authenticated sessions for each role — to be run by the user against the dev server.
- Implementation notes:
  - New role `offerEditor` + `offer:edit` permission; `superUser` also gets `offer:edit`. No Prisma migration.
  - `/aggregator-offers` create/update actions now require `offer:edit`; Create/Edit UI hidden otherwise (viewing stays open to all authenticated users).
  - Home `load` resolves capability flags in parallel, then loads only the data the user can see. Unused `userRole` is still returned (harmless) for potential future use.
  - New count helpers: `countUsers()`, `getPendingGapSubmissionCount()` (→ `countPendingStagingRecords()`).
  - Pending count is the raw count of `pending` staging records — a cheap approximation that may differ slightly from the rendered approver queue (which drops staging rows whose gap record is missing).
