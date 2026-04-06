# Offers Tool Implementation Task List

## Discount Data Quality Form

Status legend:

- `[ ]` Not started
- `[-]` In progress
- `[x]` Completed
- `[!]` Blocked / waiting on decision

Last updated: 2026-03-26

---

## 1. Scope

This task list covers the implementation of the Discount Calculation Data Quality workflow described in `docs/specs/offers-tool/Form_Functional_Spec.md`.

The feature includes:

- loading gap records from PostgreSQL
- loading item context and pricing values from ClickHouse
- submitting pricing fixes into PostgreSQL staging
- approving or rejecting staged values
- writing approved values into ClickHouse `dim_offers`

This task list assumes:

- Prisma remains the PostgreSQL access layer
- ClickHouse is integrated only for this new feature
- approval should fail hard if the ClickHouse command is rejected
- approval success only needs ClickHouse mutation submission confirmation, not mutation completion

---

## 2. Open dependencies

- `[ ]` Confirm final ClickHouse migration for `dim_offers` from `Log` to `MergeTree`
- `[ ]` Execute ClickHouse schema fix for `dim_offers`
- `[ ]` Confirm final PostgreSQL schema for `dim_offers_staging`
- `[!]` Define approve endpoint contract
- `[!]` Define reject endpoint contract
- `[ ]` Update functional spec to reflect that `selling_price = 0` is valid
- `[ ]` Update functional spec to add `dq_id` to `dim_offers_staging`
- `[ ]` Update functional spec to remove the incorrect reference that `dim_offers_staging` is in ClickHouse

---

## 3. Database work

### 3.1 PostgreSQL

- `[x]` Add Prisma model for `channels` if not already modeled for lookup reads
- `[x]` Add Prisma model for `dim_offers_staging`
- `[x]` Include `dq_id` in `dim_offers_staging`
- `[x]` Add `status` enum or compatible Prisma representation for `pending`, `approved`, `rejected`
- `[x]` Confirm Prisma model or access strategy for `dq_missing_offers_pricing`
- `[ ]` Create Prisma migration for staging and gap-tracking changes
- `[ ]` Review generated SQL before any migration execution

### 3.2 ClickHouse

- `[ ]` Create corrected `dim_offers` table definition using `MergeTree`
- `[ ]` Convert money fields to numeric types appropriate for currency values
- `[ ]` Convert `fc_perc` to a fixed-precision numeric type or confirm acceptable storage type
- `[ ]` Rename `` ` discount_amount ` `` to `discount_amount`
- `[ ]` Convert `mktg_spend` away from `String`
- `[ ]` Decide whether `product_desc` should be populated during insert flows
- `[ ]` Confirm production-safe rollout plan for replacing the existing `dim_offers`

---

## 4. Server infrastructure

### 4.1 Environment and clients

- `[x]` Add ClickHouse env vars to `.env.example`
- `[x]` Add `src/lib/server/clickhouse.ts` as the server-only ClickHouse singleton
- `[x]` Configure client settings for database, auth, and timeouts
- `[x]` Add a health-check or ping helper for local verification
- `[ ]` Normalize ClickHouse error handling for query, command, and insert failures

### 4.2 Shared types and schemas

- `[x]` Add shared browser-safe types for the form payload and load response
- `[x]` Add Zod schemas for form submission payloads
- `[x]` Add Zod schemas for API query params such as `category_id`
- `[x]` Define shared status types for open, submitted, resolved, approved, rejected states

---

## 5. Service layer

### 5.1 PostgreSQL services

- `[x]` Add a lookup service for `channels`
- `[x]` Add a lookup service for `categories`
- `[x]` Add a lookup service for filtered `subcategories`
- `[x]` Add server validation helper for category/subcategory integrity
- `[x]` Add service methods for reading `dq_missing_offers_pricing`
- `[x]` Add service methods for creating and updating `dim_offers_staging`
- `[x]` Add service methods for updating gap record status transitions

### 5.2 ClickHouse services

- `[x]` Add `transaction_details` query helper for item context lookup
- `[x]` Enforce the `trde_date` lookback filter on every `transaction_details` query
- `[x]` Add `dim_offers` query helper for pre-populating current values
- `[x]` Add `dim_offers` existence check by `item_code`
- `[x]` Add `dim_offers` insert helper for new approved rows
- `[x]` Add `dim_offers` mutation helper for approved updates
- `[x]` Add row mappers between ClickHouse result shapes and app types

### 5.3 Orchestration services

- `[x]` Add a service to load full form data from PostgreSQL + ClickHouse
- `[x]` Add a submit service that validates and writes to PostgreSQL staging
- `[x]` Add an approve service that writes to ClickHouse and updates PostgreSQL state
- `[x]` Add a reject service that updates PostgreSQL state and preserves auditability
- `[ ]` Add idempotency guards for repeated approval submissions where needed

---

## 6. API endpoints

### 6.1 Read endpoints

- `[x]` Implement `GET /api/gaps/:id`
- `[x]` Implement `GET /api/channels`
- `[x]` Implement `GET /api/categories`
- `[x]` Implement `GET /api/subcategories?category_id=:id`

### 6.2 Submit endpoint

- `[x]` Implement `POST /api/gaps/:id/submit`
- `[x]` Validate payload server-side with Zod
- `[x]` Validate category/subcategory integrity against PostgreSQL
- `[x]` Return field-level 400 errors in the documented response format

### 6.3 Approval endpoints

- `[x]` Define and implement approve endpoint
- `[x]` Define and implement reject endpoint
- `[x]` Ensure approval only succeeds after ClickHouse accepts the command
- `[x]` Ensure reject returns the gap to the open state

---

## 7. Frontend work

### 7.1 Form shell and load state

- `[x]` Add the data-quality form route/page
- `[x]` Load gap data, ClickHouse item context, and existing values through backend endpoints only
- `[ ]` Show loading skeletons while data is being fetched
- `[x]` Render the read-only context fields exactly as specified

### 7.2 Editable form

- `[x]` Build the form with `svelte-superforms` and Zod
- `[x]` Use only Svelte 5 syntax and runes
- `[x]` Use shadcn-svelte components where applicable
- `[x]` Populate channel and category dropdowns from PostgreSQL-backed APIs
- `[x]` Keep subcategory disabled until category is selected
- `[x]` Load subcategories dynamically from the API
- `[x]` Reset subcategory when category changes
- `[x]` Pre-load subcategories when the form is pre-populated with an existing category

### 7.3 Validation and UX states

- `[x]` Highlight missing fields based on `dim_offers` values from the load response
- `[x]` Treat `ideal_price` and `fc_perc` as missing when null or zero
- `[x]` Treat `selling_price = 0` as valid according to the clarified business rule
- `[x]` Re-validate `selling_price` immediately when `ideal_price` changes
- `[x]` Add euro formatting and 2-decimal handling for money fields
- `[x]` Convert `fc_perc` display value from fraction to percentage on prefill
- `[x]` Convert `fc_perc` back to fraction before submit
- `[x]` Add notes character counter with 500-char max
- `[x]` Add submit loading state and double-submit prevention
- `[x]` Preserve entered values on server errors

### 7.4 Approval UI

- `[!]` Define approver diff view requirements
- `[!]` Define reject reason UX
- `[x]` Add pending approval badge/state in the gaps list or confirmation state

---

## 8. Validation rules implementation

- `[x]` Require `channel`
- `[x]` Require `category`
- `[x]` Require `subcategory`
- `[x]` Validate `ideal_price > 0` when required
- `[x]` Validate `selling_price >= 0`
- `[x]` Validate `selling_price <= ideal_price`
- `[x]` Validate `fc_perc` input is between 0 and 100 before conversion
- `[x]` Validate `mktg_spend >= 0` when entered
- `[x]` Validate `notes` max length of 500
- `[x]` Return human-readable field errors matching the spec

---

## 9. Workflow state transitions

- `[x]` Gap starts as `open`
- `[x]` Submit sets `dq_missing_offers_pricing.status = 'submitted'`
- `[x]` Submit creates `dim_offers_staging.status = 'pending'`
- `[x]` Approve sets staging status to `approved`
- `[x]` Approve sets gap status to `resolved`
- `[x]` Approve sets `approved_by` and `approved_at`
- `[x]` Reject sets staging status to `rejected`
- `[x]` Reject reopens gap status to `open`

---

## 10. Testing

### 10.1 Server and service tests

- `[ ]` Test gap load orchestration with PostgreSQL + ClickHouse data
- `[ ]` Test subcategory validation against PostgreSQL
- `[ ]` Test submit path writing to staging and updating gap status
- `[ ]` Test approve path when `dim_offers` row exists
- `[ ]` Test approve path when `dim_offers` row does not exist
- `[ ]` Test approve path fails when ClickHouse rejects the command
- `[ ]` Test reject path reopens the gap

### 10.2 UI tests

- `[ ]` Test missing-field highlighting rules
- `[ ]` Test category → subcategory cascade behaviour
- `[x]` Test `fc_perc` display/submit conversion
- `[x]` Test `selling_price = 0` acceptance
- `[ ]` Test loading, validation, submitting, submitted, and server error states

### 10.3 Manual verification

- `[ ]` Verify ClickHouse item-context query respects the lookback window
- `[ ]` Verify approved updates reach `dim_offers`
- `[ ]` Verify new approved items insert into `dim_offers`
- `[ ]` Verify existing items mutate in `dim_offers`
- `[ ]` Verify open gaps leave the list or show pending approval state after submit

---

## 11. Documentation and cleanup

- `[ ]` Update `docs/specs/offers-tool/Form_Functional_Spec.md` with agreed clarifications
- `[x]` Add service references to `AGENTS.md` for any new service files created during implementation
- `[ ]` Document any final ClickHouse assumptions near the server ClickHouse service layer
- `[ ]` Add implementation notes for approver workflow once endpoint contract is finalized

---

## 12. Suggested delivery order

1. Fix and align schemas
2. Add ClickHouse client plumbing
3. Add PostgreSQL lookup and staging services
4. Add ClickHouse read/write services
5. Add orchestration services
6. Implement load and submit endpoints
7. Implement the form UI
8. Implement approval/rejection flow
9. Test mixed Postgres + ClickHouse paths
10. Finalize spec updates and internal docs
