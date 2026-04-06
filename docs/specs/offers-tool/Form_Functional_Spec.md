# Form Functional Specification

## Discount Calculation Data Quality System — Data Entry Form

**Document type:** Form Functional Spec | **System:** Discount Calculation Data Quality | **Version:** 2.0

---

## 1. Purpose & context

This document specifies the exact behaviour of the data entry form used to resolve missing pricing data in the `dim_offers` table. It is written for an AI code generator and must be interpreted literally. Every field, dropdown, validation rule, data source, and submission flow described here must be implemented exactly as written.

**Context:** the validation pipeline queries `transaction_details` (ClickHouse) to identify offer/coupon items that either have no matching record in `dim_offers`, or have a record where `ideal_price` is NULL or 0. Those items are surfaced in a gap list. A user opens this form for a specific item, fills in the missing values, and submits them for approval. Approved values are written to `dim_offers` in ClickHouse.

---

## 2. Data sources

The form reads from and writes to two databases. The AI must never mix up which operation goes to which database.

| Database       | Role in this form                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **ClickHouse** | Read item context (`transaction_details`). Read/write pricing data (`dim_offers`). Write staging records (`dim_offers_staging`).  |
| **PostgreSQL** | Read dropdown option lists (`channels`, `categories`, `subcategories`). Write gap tracking records (`dq_missing_offers_pricing`). |

### 2.1 PostgreSQL — lookup tables

#### channels

A flat lookup table. Query at form load to populate the channel dropdown.

```sql
SELECT id, name FROM channels ORDER BY name;
```

The channel list corresponds to these values (current database state — always fetch live, do not hardcode):

| name                     |
| ------------------------ |
| Aggregators Only         |
| All Channels             |
| Bolt Only                |
| Delivery+Take Away Only  |
| Dine In Only             |
| Dine In + Take Away Only |
| Drive-thru Only          |
| Foody Only               |
| Online Only              |
| Omnichannel              |
| Take Away Only           |
| Wolt Only                |

#### categories

```sql
SELECT id, name FROM categories ORDER BY name;
```

Current values: `BundleDisc`, `CouponBased`, `DiscPercentage`, `DiscValue`, `ONEPLUSX`

#### subcategories

Filtered by `category_id`. Query this whenever the user selects a category — never load all subcategories upfront.

```sql
SELECT id, name FROM subcategories WHERE category_id = :category_id ORDER BY name;
```

**Schema reference (Prisma):**

```prisma
model categories {
  id            Int             @id @default(autoincrement())
  name          String          @unique
  subcategories subcategories[]
}

model subcategories {
  id          Int        @id @default(autoincrement())
  category_id Int
  name        String
  category    categories @relation(fields: [category_id], references: [id])
  @@unique([category_id, name])
}
```

Current category → subcategory mapping:

| Category       | Subcategory options                       |
| -------------- | ----------------------------------------- |
| DiscPercentage | Always On, LTO                            |
| DiscValue      | Always On, LTO                            |
| BundleDisc     | Always On, LTO                            |
| CouponBased    | Customer Coupons, Loyalty, Always On, LTO |
| ONEPLUSX       | Free, x Amount, % Disc, Always On         |

### 2.2 ClickHouse — transaction_details

Used to populate the read-only item context fields when the form opens for a gap record.

**Table:** `transaction_details`
**Relevant columns:**

| Column          | Type   | Used for                                                                                        |
| --------------- | ------ | ----------------------------------------------------------------------------------------------- |
| `trde_item`     | String | Item code — the primary lookup key. Filter: `trde_item != '-1'`                                 |
| `item_name`     | String | Human-readable item name (read-only display)                                                    |
| `item_category` | String | Item category from transaction data (read-only display — not the same as `dim_offers` category) |
| `brand`         | String | Lowercase brand code (e.g. `'kfc'`, `'bk'`) — read-only display                                 |
| `trde_date`     | Date   | Partition key — always include in WHERE clause for query performance                            |

**Query to fetch item context:**

```sql
SELECT
    trde_item,
    any(item_name)     AS item_name,
    any(item_category) AS item_category,
    any(brand)         AS brand
FROM transaction_details
WHERE trde_item = :trde_item
  AND trde_item != '-1'
  AND trde_date >= :lookback_date
GROUP BY trde_item
LIMIT 1;
```

> **⚠ Performance rule** — Always filter on `trde_date` when querying `transaction_details`. It is the ClickHouse partition key. Queries without a date filter will scan the full table.

### 2.3 ClickHouse — dim_offers

The target table for approved pricing values. Also queried on form open to pre-populate existing values.

**Relevant columns:**

| Column            | Type          | Notes                                                                             |
| ----------------- | ------------- | --------------------------------------------------------------------------------- |
| `item_code`       | String        | FK — matches `transaction_details.trde_item`                                      |
| `channel`         | String        | Sales channel                                                                     |
| `category`        | String        | Offer category (matches `categories.name` in PostgreSQL)                          |
| `subcategory`     | String        | Offer subcategory (matches `subcategories.name` in PostgreSQL)                    |
| `ideal_price`     | Decimal(10,2) | Full/reference price. **Currency: Euro (€)**                                      |
| `selling_price`   | Decimal(10,2) | Price charged to customer. **Currency: Euro (€)**                                 |
| `fc_perc`         | Decimal(5,4)  | Food cost — stored as fraction (0.32 = 32%)                                       |
| `mktg_spend`      | Decimal(10,2) | Marketing spend. Optional. **Currency: Euro (€)**                                 |
| `discount_amount` | Decimal(10,2) | Computed: `ideal_price − selling_price`. Never user input. **Currency: Euro (€)** |

**Query to pre-populate existing values:**

```sql
SELECT
    channel, category, subcategory,
    ideal_price, selling_price, fc_perc,
    mktg_spend, discount_amount
FROM dim_offers
WHERE item_code = :trde_item
LIMIT 1;
```

---

## 3. Form fields specification

The form has two field groups: read-only context (sourced from ClickHouse `transaction_details`) and editable inputs (written to PostgreSQL staging on submit, then to ClickHouse `dim_offers` on approval).

### 3.1 Read-only context fields

Pre-populated from `transaction_details` (ClickHouse) using `trde_item` as the lookup key. Must not be editable by the user.

| Field label          | Source column   | Table                 | Notes                                                                                                                       |
| -------------------- | --------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Item code            | `trde_item`     | `transaction_details` | Displayed as-is. The primary key for all subsequent lookups.                                                                |
| Item name            | `item_name`     | `transaction_details` | Human-readable name.                                                                                                        |
| Brand                | `brand`         | `transaction_details` | Lowercase code — display as uppercase in UI (e.g. `kfc` → `KFC`).                                                           |
| Transaction category | `item_category` | `transaction_details` | The raw transaction category (e.g. "Offers KFC"). Displayed for context only — this is NOT the `dim_offers` category field. |

### 3.2 Editable input fields

All editable fields are sourced as dropdowns or number inputs. On form open, pre-populate from `dim_offers` (ClickHouse) if a record exists. If a value is NULL or 0, leave the field empty and mark it as missing.

| Field label     | dim_offers column | Type          | Input type   | Required       | Rules                                                                                                                                                        |
| --------------- | ----------------- | ------------- | ------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Channel         | `channel`         | VARCHAR       | Dropdown     | Yes            | Options from PostgreSQL `channels` table. Pre-select if exists in `dim_offers`.                                                                              |
| Category        | `category`        | VARCHAR       | Dropdown     | Yes            | Options from PostgreSQL `categories` table. Controls subcategory list. Pre-select if exists.                                                                 |
| Subcategory     | `subcategory`     | VARCHAR       | Dropdown     | Yes            | Options from PostgreSQL `subcategories` filtered by selected `category_id`. Disabled until category chosen. Resets on category change. Pre-select if exists. |
| Ideal price     | `ideal_price`     | Decimal(10,2) | Number input | Yes if missing | Must be > 0. **€ prefix. 2 decimal places.** Highlighted as missing if NULL or 0 in `dim_offers`.                                                            |
| Selling price   | `selling_price`   | Decimal(10,2) | Number input | Yes if missing | Must be ≥ 0 and ≤ `ideal_price`. **€ prefix. 2 decimal places.** Highlighted as missing if NULL or 0.                                                        |
| FC %            | `fc_perc`         | Decimal(5,4)  | Number input | Yes if missing | User enters a percentage (0–100). Form divides by 100 before storing (e.g. user types 32 → stored as 0.32). Highlighted as missing if NULL or 0.             |
| Marketing spend | `mktg_spend`      | Decimal(10,2) | Number input | No             | Optional. **€ prefix.** Can be 0 or left blank.                                                                                                              |
| Notes           | _(staging only)_  | VARCHAR(500)  | Textarea     | No             | Stored in `dim_offers_staging.notes` only. Never written to `dim_offers`. Max 500 chars. Show live character counter.                                        |

> **✱ Required** — `ideal_price`, `selling_price`, and `fc_perc` must be visually marked with a red outline and "missing" badge when their current value in `dim_offers` is NULL or 0. The form must block submission until all missing-flagged fields are filled with valid non-zero values.

---

## 4. Cascading dropdown: category → subcategory

The category and subcategory dropdowns are both backed by PostgreSQL. The subcategory list is dynamically filtered by the selected category via a database query — it is never pre-loaded in full.

### 4.1 Interaction rules

- Category dropdown always shows all rows from the PostgreSQL `categories` table, fetched at form load.
- When the user selects a category, the front-end calls the subcategory endpoint with the selected `category_id`. The subcategory dropdown is repopulated with the results and its current value is reset to empty.
- The subcategory dropdown is rendered as `disabled` (HTML attribute, not just visual) when no category is selected. Tooltip: "Select a category first".
- If the form pre-populates category from an existing `dim_offers` record, the matching subcategory list must also be loaded immediately — do not wait for user interaction.

### 4.2 API endpoint for subcategory filtering

```
GET /api/subcategories?category_id=:id
```

**Response:**

```json
[
  { "id": 3, "name": "Always On" },
  { "id": 4, "name": "LTO" }
]
```

### 4.3 Server-side validation of category/subcategory pair

On submission, the server must query PostgreSQL to confirm the submitted `subcategory` name belongs to the submitted `category`. Reject with 400 if the pair is invalid.

```sql
SELECT 1
FROM subcategories s
JOIN categories c ON s.category_id = c.id
WHERE c.name = :category AND s.name = :subcategory
LIMIT 1;
```

### 4.4 Category → subcategory mapping (current database state)

| Category       | Subcategory options                       |
| -------------- | ----------------------------------------- |
| DiscPercentage | Always On, LTO                            |
| DiscValue      | Always On, LTO                            |
| BundleDisc     | Always On, LTO                            |
| CouponBased    | Customer Coupons, Loyalty, Always On, LTO |
| ONEPLUSX       | Free, x Amount, % Disc, Always On         |

> This table reflects the current database state and is provided for reference only. The form must always fetch live data — never hardcode these values.

---

## 5. Validation rules

All validations are enforced client-side on submit AND server-side before writing to staging. Client-side errors appear inline under the field. Server-side errors return HTTP 400 with field-level detail.

### 5.1 Field-level rules

| Field           | Rule             | Condition                                      | Error message                                   |
| --------------- | ---------------- | ---------------------------------------------- | ----------------------------------------------- |
| `channel`       | Required         | Must not be empty                              | "Channel is required"                           |
| `category`      | Required         | Must not be empty                              | "Category is required"                          |
| `subcategory`   | Required         | Must not be empty                              | "Subcategory is required"                       |
| `subcategory`   | DB integrity     | Must belong to selected category (server-side) | "Invalid subcategory for the selected category" |
| `ideal_price`   | Required + Range | Must be > 0 when flagged missing               | "Ideal price must be greater than 0"            |
| `selling_price` | Range            | Must be ≥ 0 and ≤ `ideal_price`                | "Selling price cannot exceed ideal price"       |
| `fc_perc`       | Range            | Input must be between 0 and 100                | "Food cost % must be between 0 and 100"         |
| `mktg_spend`    | Range            | Must be ≥ 0 if entered                         | "Marketing spend cannot be negative"            |
| `notes`         | Length           | Max 500 characters                             | "Notes cannot exceed 500 characters"            |

### 5.2 Cross-field rules

- If `selling_price` > `ideal_price`: block submission. Show: "Selling price (€X.XX) cannot be greater than ideal price (€Y.YY)".
- If `category` changes after `subcategory` is set: reset `subcategory` to empty. Re-validate before allowing submission.
- If `ideal_price` changes: immediately re-validate `selling_price` even if `selling_price` field has not been touched.

> **⚠ Note** — `discount_amount` is never entered by the user. It is computed on approval as `ideal_price − selling_price` and written directly to `dim_offers` in ClickHouse. Do not render it as an input field.

---

## 6. Submission and approval flow

Two-step write: **submit → approve**. The user submits to a PostgreSQL staging table. The approver reviews the diff and approves or rejects. On approval, values are written to ClickHouse `dim_offers`.

### 6.1 On submit (user action)

1. Run all validations (Section 5). Block if any fail.
2. Write one row to `dim_offers_staging` (PostgreSQL) — see Section 9 for schema.
3. Update `dq_missing_offers_pricing` (PostgreSQL): set `status = 'submitted'`.
4. Remove item from the open-gaps list in the UI (or mark with "pending approval" badge).
5. Show success toast: "Submitted for approval — [item_name]"

### 6.2 On approve (approver action)

1. Approver reviews submitted values against current `dim_offers` values (diff view).
2. On approval, write to ClickHouse `dim_offers`:

```sql
-- If record exists:
ALTER TABLE dim_offers UPDATE
    channel          = :channel,
    category         = :category,
    subcategory      = :subcategory,
    ideal_price      = :ideal_price,
    selling_price    = :selling_price,
    fc_perc          = :fc_perc,
    mktg_spend       = :mktg_spend,
    discount_amount  = :ideal_price - :selling_price
WHERE item_code = :trde_item;

-- If no record exists:
INSERT INTO dim_offers
    (item_code, channel, category, subcategory, ideal_price, selling_price, fc_perc, mktg_spend, discount_amount)
VALUES
    (:trde_item, :channel, :category, :subcategory, :ideal_price, :selling_price, :fc_perc, :mktg_spend, :ideal_price - :selling_price);
```

3. Update `dim_offers_staging` (PostgreSQL): `status = 'approved'`, set `approved_by`, `approved_at`.
4. Update `dq_missing_offers_pricing` (PostgreSQL): `status = 'resolved'`, set `resolved_at`.

> **⚠ ClickHouse note** — ClickHouse does not support standard SQL `UPDATE`/`INSERT OR UPDATE`. Use `ALTER TABLE ... UPDATE` (mutation) for updates, and `INSERT INTO` for new rows. Mutations are asynchronous — the approval endpoint should confirm the mutation was submitted, not wait for completion.

### 6.3 On reject (approver action)

1. Update `dim_offers_staging` (PostgreSQL): `status = 'rejected'`.
2. Update `dq_missing_offers_pricing` (PostgreSQL): `status = 'open'` (re-opens the gap).
3. Notify the submitter with the rejection reason if provided.

---

## 7. Form UI states

| State                 | Trigger                           | Expected behaviour                                                                                                                                                                     |
| --------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading               | Form opens                        | Fetch item context from ClickHouse `transaction_details`. Fetch existing values from ClickHouse `dim_offers`. Fetch channel and category lists from PostgreSQL. Show skeleton loaders. |
| Ready / pre-populated | All fetches complete              | Read-only fields populated. Editable fields pre-populated where `dim_offers` has non-null, non-zero values. Missing fields highlighted red with badge.                                 |
| Subcategory disabled  | Category is empty                 | Subcategory uses `disabled` HTML attribute. Tooltip: "Select a category first".                                                                                                        |
| Subcategory loading   | Category just selected            | Call `GET /api/subcategories?category_id=X`. Show spinner inside subcategory dropdown.                                                                                                 |
| Subcategory ready     | Subcategory fetch complete        | Subcategory dropdown enabled and populated. Value reset to empty (or pre-selected if editing).                                                                                         |
| Validation error      | Submit clicked with errors        | Inline error messages under each invalid field. Submit button stays disabled until all errors resolved.                                                                                |
| Submitting            | Submit clicked (valid)            | Submit button shows loading state. All fields become read-only. Prevent double-submission.                                                                                             |
| Submitted             | PostgreSQL staging write succeeds | Form transitions to confirmation view. Item leaves open-gaps list.                                                                                                                     |
| Server error          | Any API returns non-200           | Toast: "Submission failed — please try again". Form stays open with all entered values preserved.                                                                                      |

---

## 8. API contract

All endpoints require an authenticated session. All responses are JSON. The backend is responsible for routing reads to the correct database (ClickHouse vs PostgreSQL).

### 8.1 GET /api/gaps/:id — load form data

Fetches everything the form needs to render: the gap record, item context from ClickHouse `transaction_details`, and existing pricing values from ClickHouse `dim_offers`.

**Response:**

```json
{
  "dq_id": 42,
  "trde_item": "ITM-4821",
  "item_name": "Zinger Box Meal",
  "brand": "KFC",
  "item_category": "Offers KFC",
  "missing_fields": ["ideal_price", "fc_perc"],
  "current_dim_offers": {
    "channel": "Wolt Only",
    "category": "ONEPLUSX",
    "subcategory": null,
    "ideal_price": 0,
    "selling_price": 5.99,
    "fc_perc": null,
    "mktg_spend": null
  }
}
```

> `item_name`, `brand`, and `item_category` are resolved server-side from ClickHouse `transaction_details`. `current_dim_offers` is resolved server-side from ClickHouse `dim_offers`. The front-end never queries ClickHouse directly.

### 8.2 GET /api/channels — channel dropdown options

```json
[
  { "id": 1, "name": "All Channels" },
  { "id": 2, "name": "Wolt Only" }
]
```

### 8.3 GET /api/categories — category dropdown options

```json
[
  { "id": 1, "name": "DiscPercentage" },
  { "id": 2, "name": "ONEPLUSX" }
]
```

### 8.4 GET /api/subcategories?category_id=:id — filtered subcategory options

```json
[
  { "id": 3, "name": "Free" },
  { "id": 4, "name": "x Amount" },
  { "id": 5, "name": "% Disc" },
  { "id": 6, "name": "Always On" }
]
```

### 8.5 POST /api/gaps/:id/submit — submit pricing values

**Request body:**

```json
{
  "channel": "Wolt Only",
  "category": "ONEPLUSX",
  "subcategory": "% Disc",
  "ideal_price": 8.5,
  "selling_price": 5.99,
  "fc_perc": 0.32,
  "mktg_spend": 0.0,
  "notes": "Sourced from pricing sheet v3"
}
```

> `fc_perc` must be sent as a decimal fraction (0.32), not as a percentage (32). The front-end divides the user's input by 100 before including it in the payload.

**Success (201):**

```json
{
  "staging_id": 99,
  "status": "pending",
  "submitted_at": "2026-03-26T10:00:00Z"
}
```

**Validation error (400):**

```json
{
  "errors": {
    "ideal_price": "Must be greater than 0",
    "subcategory": "Required"
  }
}
```

---

## 9. Database schema reference

### PostgreSQL — dim_offers_staging

Written on form submission. Read by approver. Never written to ClickHouse directly.

| Column          | Type          | Source           | Notes                                                           |
| --------------- | ------------- | ---------------- | --------------------------------------------------------------- |
| `id`            | SERIAL PK     | System           | Auto-increment                                                  |
| `item_code`     | VARCHAR       | Form (read-only) | FK reference to `dim_offers.item_code` in ClickHouse            |
| `channel`       | VARCHAR       | User input       | Must exist in PostgreSQL `channels.name`                        |
| `category`      | VARCHAR       | User input       | Must exist in PostgreSQL `categories.name`                      |
| `subcategory`   | VARCHAR       | User input       | Must belong to submitted category in PostgreSQL `subcategories` |
| `ideal_price`   | DECIMAL(10,2) | User input       | Must be > 0. **Currency: Euro (€)**                             |
| `selling_price` | DECIMAL(10,2) | User input       | Must be ≤ `ideal_price`. **Currency: Euro (€)**                 |
| `fc_perc`       | DECIMAL(5,4)  | User input       | Stored as fraction (user enters %, API divides by 100)          |
| `mktg_spend`    | DECIMAL(10,2) | User input       | Optional, nullable. **Currency: Euro (€)**                      |
| `notes`         | VARCHAR(500)  | User input       | Staging only — never copied to `dim_offers`                     |
| `submitted_by`  | VARCHAR       | System           | Authenticated user ID                                           |
| `submitted_at`  | TIMESTAMP     | System           | UTC timestamp                                                   |
| `approved_by`   | VARCHAR       | System           | Approver user ID (nullable until approved)                      |
| `approved_at`   | TIMESTAMP     | System           | UTC timestamp of approval (nullable)                            |
| `status`        | ENUM          | System           | `pending` / `approved` / `rejected`                             |

### PostgreSQL — dq_missing_offers_pricing

Gap tracking table. Updated at each stage of the workflow.

| Column           | Type      | Notes                                                           |
| ---------------- | --------- | --------------------------------------------------------------- |
| `dq_id`          | INT PK    |                                                                 |
| `trde_item`      | VARCHAR   | Item code from ClickHouse `transaction_details.trde_item`       |
| `item_name`      | VARCHAR   | Denormalised from ClickHouse at detection time                  |
| `brand`          | VARCHAR   | Denormalised from ClickHouse at detection time                  |
| `item_category`  | VARCHAR   | Denormalised from ClickHouse at detection time                  |
| `missing_fields` | VARCHAR   | Comma-separated list: `ideal_price`, `selling_price`, `fc_perc` |
| `detected_at`    | TIMESTAMP | When the validation pipeline first detected the gap             |
| `status`         | ENUM      | `open` / `submitted` / `resolved`                               |
| `resolved_at`    | TIMESTAMP | Nullable — set on approval                                      |

### ClickHouse — dim_offers (write target)

Written to on approval only. Never written directly from the form.

| Column            | Type          | Notes                                                      |
| ----------------- | ------------- | ---------------------------------------------------------- |
| `item_code`       | String        | Matches `transaction_details.trde_item`                    |
| `channel`         | String        | Value approved from staging                                |
| `category`        | String        | Value approved from staging                                |
| `subcategory`     | String        | Value approved from staging                                |
| `ideal_price`     | Decimal(10,2) | **€**                                                      |
| `selling_price`   | Decimal(10,2) | **€**                                                      |
| `fc_perc`         | Decimal(5,4)  | Stored as fraction                                         |
| `mktg_spend`      | Decimal(10,2) | **€** — nullable                                           |
| `discount_amount` | Decimal(10,2) | Computed on approval: `ideal_price − selling_price`. **€** |

---

## 10. Implementation notes for code generation

- **ClickHouse is read-only from the front-end.** All ClickHouse queries (`transaction_details`, `dim_offers`) are executed server-side by the API. The front-end only calls the REST endpoints defined in Section 8.
- **fc_perc conversion:** user enters `32`. Front-end sends `0.32` in the API payload (divide by 100). On pre-population: multiply `fc_perc` from `dim_offers` by 100 before displaying in the input field.
- **Missing-field detection:** a field is "missing" if its value in `dim_offers` is NULL or exactly `0`. For `ideal_price` and `fc_perc` this always means missing. For `selling_price`, `0` is only valid if `ideal_price` is also `0` (free item).
- **Pre-population order:** (1) fetch gap record from PostgreSQL `dq_missing_offers_pricing`, (2) fetch item context from ClickHouse `transaction_details`, (3) fetch existing pricing from ClickHouse `dim_offers`, (4) fetch channel/category lists from PostgreSQL. Steps 2–4 can run in parallel. Render the form only when all four are complete.
- **Subcategory pre-population:** if `dim_offers` already has a category value, immediately call `GET /api/subcategories?category_id=X` at form load (do not wait for user interaction) so the subcategory dropdown is populated and the existing value can be pre-selected.
- **ClickHouse mutations are async:** after calling `ALTER TABLE dim_offers UPDATE` on approval, the API should return success once the mutation is submitted to ClickHouse — not wait for the mutation to complete. Update PostgreSQL staging and gap records synchronously.
- **Currency:** all monetary values (`ideal_price`, `selling_price`, `mktg_spend`, `discount_amount`) are in **Euro (€)**. Always display with `€` prefix and 2 decimal places. Store as `Decimal(10,2)`.
- **Date filter on ClickHouse:** every query against `transaction_details` must include a `trde_date` filter. Use a configurable lookback window (default: last 90 days) to scope queries to the partition key and avoid full-table scans.
- **Accessibility:** subcategory `disabled` state must use the HTML `disabled` attribute. All required fields must carry `aria-required="true"`.

---

_End of document — Discount Data Quality System: Form Functional Specification v2.0_
