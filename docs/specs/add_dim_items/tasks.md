# Add `apidata_replica.dim_items` to Offers Data Quality Queue

Status legend:

- `[ ]` Not started
- `[-]` In progress
- `[x]` Completed
- `[!]` Blocked / waiting on decision

Created: 2026-05-28
Last updated: 2026-05-28

---

## 1. Scope

The missing-offers queue at `/offers-data-quality` currently sources item identity (`item_name`, `item_category`, `brand`) from `transaction_details` in ClickHouse. Because `transaction_details` is a fact table, `item_name` reflects whatever the row was at transaction time and can drift from current truth. It also has no notion of whether an item is still "live".

The dimension table `apidata_replica.dim_items` is the source of truth for current item names and their active status. This change routes the queue through `dim_items` so listings stay fresh and inactive items drop out automatically.

### Confirmed decisions (locked)

- **Join key**: `apidata_replica.dim_items.item_code = transaction_details.trde_item`.
- **Join type**: INNER JOIN — items missing from `dim_items` or with `item_active = false` must not appear.
- **`getTransactionItemContext`**: same treatment — name from `dim_items`, `item_active = true` enforced. Inactive/missing items return `null`; existing callers already fall back to the persisted gap record.
- **Already-tracked PostgreSQL gaps** (`dq_missing_offers_pricing`) for inactive/missing/recategorized items: hidden from the queue overlay rendered by `getOpenGapList`. Filtering happens against the leftover tracked-only set, not against the merged result, so items that simply have no recent transactions but are still active **and still in an offer category** stay visible.
- **Recategorization** (revised 2026-05-28): if a tracked item is later moved out of `OFFER_ITEM_CATEGORIES` in `dim_items` (e.g., reclassified as "Snacks A La Carte"), it must disappear from the queue. The helper that gates the leftover set is therefore `getOfferEligibleItemCodes` — checks **both** `item_active = 1` AND `item_category IN (OFFER_ITEM_CATEGORIES)`.
- **`item_category`**: revised decision (2026-05-28) — now sourced from `dim_items` (column `item_category`) in both the queue query and `getTransactionItemContext`. The `OFFER_ITEM_CATEGORIES` filter is also applied against `di.item_category` so the queue reflects what items currently *are*, not what they were at transaction time.
- **`brand`**: continues to come from `transaction_details` (the `dim_items` table has no brand column).
- Only `td.brand` still comes from `transaction_details`; `item_name`, `item_category`, and active-status all flow from `dim_items`.

### Reference

- Affected services:
  - `src/lib/services/offers-data-quality-clickhouse.server.ts`
  - `src/lib/services/offers-data-quality.server.ts`
- Affected tests:
  - `src/lib/services/offers-data-quality.test.ts`
- Routes consuming the changed services (no edits expected):
  - `src/routes/offers-data-quality/+page.server.ts`
  - `src/routes/offers-data-quality/[id]/+page.server.ts`
  - `src/routes/offers-data-quality/open/[itemCode]/+server.ts`
  - `src/routes/admin/pending-submissions/+page.server.ts`

---

## 2. Open dependencies / pre-flight

- `[x]` Confirm the ClickHouse user the app authenticates as has `SELECT` privileges on `apidata_replica.dim_items` in every environment (dev, staging, prod). The current queries only touch `transaction_details` and `dim_offers` — `apidata_replica.dim_items` is a new dependency. (Verified against dev — queries succeed.)
- `[x]` Confirm the dimension table column names against the live schema before writing SQL (`item_code`, `item_name`, `item_active`). If the live column for the active flag is named differently (e.g. `is_active`, `active`), update the SQL accordingly. (Live schema: `item_code`, `item_description` (NOT `item_name`), `item_active`. SQL now projects `di.item_description AS item_name`.)
- `[x]` Confirm the active flag's data type in `dim_items`. If it is stored as `UInt8` / `Boolean`, `item_active = true` works. If it is stored as a tinyint flag, use `item_active = 1`. (Live type: `Nullable(UInt8)` — using `item_active = 1` in all three queries.)

> Verify by issuing a one-off `DESCRIBE apidata_replica.dim_items` against the same ClickHouse cluster before starting Phase 3.

---

## 3. Phase 1 — ClickHouse layer

### 3.1 Update `listMissingOfferQueueRows` to source name + active filter from `apidata_replica.dim_items`

- `[x]` Edit `src/lib/services/offers-data-quality-clickhouse.server.ts`. In the inner DISTINCT subquery, alias `transaction_details` as `td` and add `INNER JOIN apidata_replica.dim_items di ON di.item_code = td.trde_item`.
- `[x]` Push `di.item_active = true` into the inner WHERE alongside the existing `trde_date >= since_date` and `item_category IN OFFER_ITEM_CATEGORIES` filters.
- `[x]` Project `di.item_name AS item_name` instead of `td.item_name`. Keep `td.brand` and `td.item_category` unchanged.
- `[x]` Confirm the outer `LEFT JOIN dim_offers do ON td.trde_item = do.item_code` and the `do.item_code IS NULL OR (do.ideal_price IS NULL OR do.ideal_price = 0)` filter remain unchanged.
- `[x]` Confirm the row mapping below the query (the `rows.map(...)` returning `MissingOfferQueueRow[]`) needs no edits — column names are unchanged.

### 3.2 Update `getTransactionItemContext` to source name + active filter from `apidata_replica.dim_items`

- `[x]` In the same file, modify the `getTransactionItemContext` SQL: alias `transaction_details` as `td`, INNER JOIN `apidata_replica.dim_items di` on `di.item_code = td.trde_item` with `di.item_active = true`.
- `[x]` Replace `any(item_name) AS item_name` with `any(di.item_name) AS item_name`. Keep `any(td.brand)` and `any(td.item_category)` unchanged. `GROUP BY td.trde_item` (or stay with `GROUP BY trde_item` if the alias keeps that resolvable) and `LIMIT 1`.
- `[x]` Verify callers (`getGapFormData`, `getPendingGapSubmissionQueue`) already treat a `null` return as "use the persisted gap record" — no edits expected.

### 3.3 Add `getOfferEligibleItemCodes(itemCodes: string[])` helper

> Revised 2026-05-28: originally named `getActiveItemCodes` and only checked `item_active = 1`. Renamed and extended to also enforce the offer-category check after diagnosing 6 KFC leftovers that survived the active check but had been recategorized out of `OFFER_ITEM_CATEGORIES` in `dim_items`.

- `[x]` Add a new exported async function in `src/lib/services/offers-data-quality-clickhouse.server.ts` with signature `getOfferEligibleItemCodes(itemCodes: string[]): Promise<Set<string>>`.
- `[x]` Short-circuit to `new Set()` when the input array is empty (no DB call).
- `[x]` Otherwise: `SELECT item_code FROM apidata_replica.dim_items WHERE item_active = 1 AND item_category IN ({offer_categories:Array(String)}) AND item_code IN ({item_codes:Array(String)})`. Bind both the `OFFER_ITEM_CATEGORIES` constant and the input codes via `query_params`.
- `[x]` Return a `Set` constructed from the `item_code` values of the result rows.

---

## 4. Phase 2 — Orchestration layer

### 4.1 Filter tracked-only gaps in `getOpenGapList` against the active set

- `[x]` Edit `src/lib/services/offers-data-quality.server.ts`. Add `getActiveItemCodes` to the existing import from `$lib/services/offers-data-quality-clickhouse.server`.
- `[x]` In `getOpenGapList`, after the `for (const row of visibleClickhouseRows)` loop has consumed ClickHouse rows and reduced `trackedGapByItemCode` to leftovers, gather their `trde_item`s into an array.
- `[x]` Skip the helper call when the leftover array is empty.
- `[x]` Otherwise call `await getActiveItemCodes(leftoverCodes)` once and append only leftover gaps whose `trde_item` is in the returned set. Drop the rest silently.
- `[x]` Confirm `ensureGapRecordForItemCode` and `getGapFormData` need no further edits (the upstream changes already prevent inactive items from appearing in `listMissingOfferQueueRows()` and `getTransactionItemContext` returns `null` which existing fallbacks already handle).

---

## 5. Phase 3 — Tests

### 5.1 Extend mock factory

- `[x]` In `src/lib/services/offers-data-quality.test.ts`, add `getActiveItemCodes: vi.fn()` to the `vi.mock("./offers-data-quality-clickhouse.server", ...)` factory.
- `[x]` Add `getActiveItemCodes: clickhouseDeps.getActiveItemCodes as Mock` to the `serviceDeps` object.

### 5.2 Default mock value for existing tests

- `[x]` In each existing test that calls `orchestration.getOpenGapList(...)`, default `serviceDeps.getActiveItemCodes` to resolve a `Set` containing every tracked code used in that test, so existing assertions continue to pass. (Implemented via `beforeEach` default mock — returns `new Set(itemCodes)` for any input so all leftover tracked gaps stay visible by default.)
- `[x]` Re-run the full suite to confirm no existing test regresses.

### 5.3 New test: tracked-only gap for inactive item is hidden

- `[x]` Mock `listGapRecords` to return one tracked gap with `trde_item: "ITM-INACTIVE"`. Mock `listMissingOfferQueueRows` to return `[]`. Mock `getActiveItemCodes` to resolve `new Set()`.
- `[x]` Assert `(await orchestration.getOpenGapList()).items` does **not** include `ITM-INACTIVE` and `totalItems === 0`.

### 5.4 New test: tracked-only gap for still-active item stays visible

- `[x]` Mock `listGapRecords` to return one tracked gap with `trde_item: "ITM-ACTIVE"`. Mock `listMissingOfferQueueRows` to return `[]` (e.g., no recent transactions). Mock `getActiveItemCodes` to resolve `new Set(["ITM-ACTIVE"])`.
- `[x]` Assert the item is present in the queue with its persisted `dq_id`, `status`, and `missing_fields`.

### 5.5 (Optional) Empty-input guard for `getActiveItemCodes`

- `[ ]` If exposing `getActiveItemCodes` directly is feasible from the test, assert that calling it with `[]` does not invoke the ClickHouse client. Otherwise rely on the orchestrator-level test coverage. (Skipped — relying on orchestrator-level coverage; the empty-input short-circuit lives inside the helper itself.)

---

## 6. Phase 4 — Verification

- `[x]` Run `bun run test` — full suite green. (218/218 passed; offers-data-quality suite now 17 tests including the two new active/inactive cases.)
- `[x]` Run `bun run check` — no type / svelte-check regressions. (0 errors; 3 pre-existing warnings unrelated to this change.)
- `[x]` Run `bun run svelte-autofixer` — formatting applied. (No changes — files were already correctly formatted.)
- `[ ]` Manual: open `/offers-data-quality` against a ClickHouse env with at least one renamed item in `dim_items` — confirm the queue shows the new name.
- `[ ]` Manual: confirm an item with `dim_items.item_active = false` no longer appears in the queue, and a tracked PostgreSQL gap for that same item is also hidden.
- `[ ]` Manual: confirm a tracked gap whose item is still active but had no recent transactions in the lookback window remains visible.
- `[ ]` Manual: open an existing tracked gap form for a renamed item and confirm the header shows the refreshed name.
- `[ ]` Manual: open an existing tracked gap form for an item that has since gone inactive and confirm the header falls back to the persisted gap record's name (no crash).

---

## 7. Rollout / risk notes

- **Blast radius**: limited to two service files plus their tests. No schema or migration changes. No route handler edits.
- **Reversibility**: pure SQL/TS change. Revert by restoring the previous query bodies and dropping `getActiveItemCodes` plus its call site in `getOpenGapList`.
- **Behavioral change visible to users**: previously listed items that exist in `transaction_details` but are not active (or not present) in `dim_items` will disappear from the queue. Communicate this to the marketing/data-quality team before deploy so vanished rows are expected.
- **Performance**: the new INNER JOIN against a dimension table is keyed by `item_code` and bounded by the existing date + category filters; expected impact negligible. The `getActiveItemCodes` lookup is a single bounded `IN (...)` query over the small set of leftover tracked gaps.
