---
name: management-accounts-sql
description: How the SAP warehouse (MSSQL SAPBW) GL, chart of accounts and budgets relate, the rules that make marketing-spend numbers match the Power BI Management Accounts dashboard, the company/cost-centre → brand map, and proven T-SQL patterns for marketing-spend questions.
---

# Management accounts — marketing spend (MSSQL SAPBW)

Every number you report about marketing spend must follow the **Power BI rules**
in this file. With them, our totals match the Power BI "Financial Performance"
widget **to the euro** for 2023, 2024 and 2025 (verified 2026-11-06 against a
Power BI export, account by account). Skipping any rule gives wrong numbers.

Dialect: **T-SQL** (SQL Server). Use `TOP n`, not `LIMIT`. No semicolons, no
comments, single SELECT / WITH statement. Tables live in schema `dbo`.

## 1. Tables

### dbo.sapbw_gl — general-ledger postings (≈7.1M rows, 2022 →)

One row per journal line, all group companies in one table.

| Column                                          | Type               | Meaning                                                                                                                                                                                                           |
| ----------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| databaseId                                      | nvarchar           | SAP company database, e.g. `PHC_EUR`, `WOWBURGERSDB`. **Exclude `ODLONEDB`.**                                                                                                                                     |
| companyName                                     | nvarchar           | Legal company name (see §4). Use this for "company" questions.                                                                                                                                                    |
| TransId, LineID                                 | int                | Journal entry id + line number.                                                                                                                                                                                   |
| PostingDate                                     | datetime           | **The date to filter and group by.** Midnight, no time part.                                                                                                                                                      |
| DocumentDate, DueDate                           | datetime           | Ignore for P&L questions.                                                                                                                                                                                         |
| TranstypeCode / TransTypeName                   | nvarchar / varchar | `18` APInvoice, `30` JournalEntry, `19` APCreditNote, `13` ARInvoice, `-3` **ClosingYearEntry (always exclude)**, …                                                                                               |
| OriginalDocNo                                   | nvarchar           | Source document number (e.g. AP invoice no).                                                                                                                                                                      |
| HeaderRemarks, LineRemarks                      | nvarchar           | Free text: often the supplier/campaign description. Useful for "what was this spend for".                                                                                                                         |
| GLAccount                                       | nvarchar(15)       | Account code = `sapbw_coa.Level5Code`.                                                                                                                                                                            |
| AccountName                                     | nvarchar           | Account name as posted (prefer `sapbw_coa.Level5Name`).                                                                                                                                                           |
| BPCode, BPName                                  | nvarchar           | Business partner. **Empty on expense lines**: the supplier sits on the payables line of the same `databaseId + TransId` (one supplier per AP invoice). Journal entries have none. See the supplier pattern in §5. |
| Debit, Credit                                   | decimal(19,6)      | Amounts in EUR. **Value = Credit − Debit** (costs negative).                                                                                                                                                      |
| CostCenter                                      | nvarchar(8)        | Distribution rule = **brand/division code** (`PH`, `KFC`, `BK`, `HO`…), see §4.                                                                                                                                   |
| StoreLocationCode / StoreLocationName           | nvarchar           | Store/project code, e.g. `PH202` "202-PH STROVOLOS", `201` head office.                                                                                                                                           |
| Ref1–3, VehicleInfo, JEUtility, MeterFrom/To    |                    | Rarely useful for marketing.                                                                                                                                                                                      |
| CreatedAt, UpdatedAt, LastModified, BWSynched\* |                    | Warehouse sync metadata — **not** business dates.                                                                                                                                                                 |

### dbo.sapbw_coa — chart of accounts (1,185 rows)

5-level hierarchy. Holds only `databaseId = 'PHC_EUR'`, but account codes are
**group-wide**, so it applies to every company. A handful of Level5Codes are
duplicated → always read it through `SELECT DISTINCT`.

| Column          | Meaning                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Level1Code/Name | `400…` REVENUES, `500…` COST OF SALES, `600…` OPERATING EXPENSES, `700…` FINANCIAL EXPENSES, `800…` TAXATION (1xx–3xx = balance sheet) |
| Level2Name      | e.g. Selling & Distribution Expenses                                                                                                   |
| Level3Name      | **`Marketing`** = the marketing block                                                                                                  |
| Level4Code/Name | Marketing line shown in Power BI (e.g. `610117` Social Media Expenses)                                                                 |
| Level5Code/Name | The posting account (= `sapbw_gl.GLAccount`), e.g. `61011702` Social Media Advertising Cost                                            |

### dbo.sapbw_budgets — yearly budget/forecast (≈27k rows)

One row per year × company × cost centre × location × account; the 12 months
are columns.

| Column                   | Meaning                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| databaseId, companyname  | Company (same names as GL `companyName`).                                                                |
| Code                     | `<year>-<CostCentre>-<Location>/<Account>`, unique.                                                      |
| U_YEAR                   | Budget year as **text** (`'2026'`).                                                                      |
| U_CostCentre, U_Location | Same code style as GL `CostCenter` / `StoreLocationCode`.                                                |
| U_Acctcode, U_AcctName   | Account (= `sapbw_coa.Level5Code`).                                                                      |
| U_BAJAN … U_BADEC        | **Budget amount** per month, same sign as GL (costs negative). NULL = 0.                                 |
| U_FAJAN … U_FADEC        | Forecast amount per month — **almost always NULL** (only PHC 2024, DAFERA 2025). Don't use unless asked. |
| U_BT*/U_FT*              | Integers (budgeted transaction counts on sales accounts) — ignore for marketing.                         |

Marketing budgets exist for 2024 (PHC only), 2025 and 2026.

## 2. How the tables relate

```
sapbw_gl.GLAccount        = sapbw_coa.Level5Code       (join on code ONLY, never on databaseId)
sapbw_budgets.U_Acctcode  = sapbw_coa.Level5Code
sapbw_gl.companyName      = sapbw_budgets.companyname   (same spelling)
sapbw_gl.CostCenter       ≈ sapbw_budgets.U_CostCentre  (brand/division code)
sapbw_gl.StoreLocationCode≈ sapbw_budgets.U_Location    (store / head-office code)
```

## 3. The marketing rules (match Power BI)

1. **Marketing accounts** = `Level3Name = 'Marketing'` …
2. … **excluding** Level4 `610120` "Aggregators Fees & Advertising" (that is the
   Aggregator Commissions block) …
3. … **except** `61012014` (Foody), `61012015` (Wolt), `61012016` (Bolt)
   "Aggregators Commission - … Marketing Costs", which Power BI reports under
   **Internet Advertising Expenses** (Level4 `610121`).
4. Value = `SUM(Credit - Debit)`; costs are negative. "Spend" = `-SUM(Credit - Debit)`.
5. Exclude closing entries: `TranstypeCode <> '-3'`.
6. Exclude ODL One Delivery: `databaseId <> 'ODLONEDB'` (Power BI drops it from
   the whole widget; reason unknown).
7. Columns in Power BI are **calendar years** by `PostingDate`; no store or month
   filter. Bound queries with `PostingDate >= 'YYYY-01-01' AND PostingDate < 'YYYY+1-01-01'`.
8. The GL contains future-dated accruals (up to 2027): never use "all dates";
   for "to date" use `PostingDate < CAST(GETDATE() AS date)` and say so.

Reference CTE — **start every marketing query from this**:

```sql
WITH coa AS (
  SELECT DISTINCT Level3Name, Level4Code, Level4Name, Level5Code, Level5Name
  FROM dbo.sapbw_coa
),
mkt AS (
  SELECT
    g.databaseId, g.TransId, g.companyName, g.CostCenter, g.StoreLocationCode, g.PostingDate,
    g.LineRemarks, g.TransTypeName,
    CASE WHEN g.GLAccount IN ('61012014','61012015','61012016') THEN '610121' ELSE c.Level4Code END AS line_code,
    CASE WHEN g.GLAccount IN ('61012014','61012015','61012016') THEN 'Internet Advertising Expenses' ELSE c.Level4Name END AS line_name,
    c.Level5Code AS account_code, c.Level5Name AS account_name,
    g.Credit - g.Debit AS value
  FROM dbo.sapbw_gl g
  JOIN coa c ON c.Level5Code = g.GLAccount
  WHERE c.Level3Name = 'Marketing'
    AND (c.Level4Code <> '610120' OR g.GLAccount IN ('61012014','61012015','61012016'))
    AND g.TranstypeCode <> '-3'
    AND g.databaseId <> 'ODLONEDB'
    AND g.PostingDate >= '2025-01-01' AND g.PostingDate < '2026-01-01'
)
SELECT line_name, -SUM(value) AS spend
FROM mkt
GROUP BY line_name
ORDER BY spend DESC
```

### Marketing lines (Level4) — what each means

| Code            | Line                                    | Typical content                                                                    |
| --------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| 610100          | Media Advertising                       | TV, radio, cinema airtime                                                          |
| 610101          | Media Production Cost                   | Producing TV/radio spots                                                           |
| 610102 / 610103 | Press Advertising / Press Artwork Cost  | Newspapers, magazines                                                              |
| 610104          | Outdoor Advertising                     | Billboards                                                                         |
| 610105          | Leaflets                                | Door-to-door leaflets                                                              |
| 610106          | Menus                                   | Printed menus                                                                      |
| 610107          | POS Materials                           | Posters, banners, placemats, tent cards, photography                               |
| 610108          | Promotions                              | Promotional items/activations                                                      |
| 610109          | Promotional Discounts & Complimentaries | Free/discounted food given in promotions — large line                              |
| 610110          | Vacancies Marketing Expenses            | Recruitment ads                                                                    |
| 610111          | Agency Fees                             | Agency retainers, YUM Marketing CO-OP                                              |
| 610112          | Market Research                         |                                                                                    |
| 610113          | Sponsorships                            | Events, sports, sponsorships                                                       |
| 610114          | Airport Advertising                     |                                                                                    |
| 610115          | Signs Maintenance & Cost                | Shop signage                                                                       |
| 610116          | Website expenses & Tools                | Website, hosting, digital tools                                                    |
| 610117          | Social Media Expenses                   | Paid social, artwork, influencers                                                  |
| 610118          | In Mall Advertising                     |                                                                                    |
| 610119          | Bus Advertising                         |                                                                                    |
| 610121          | Internet Advertising Expenses           | Google/YouTube/portals **+ aggregator marketing (Foody/Wolt/Bolt) 61012014/15/16** |
| 610189          | Advertising Provision                   | Year-end provisions                                                                |

## 4. Company and brand

`companyName` values in the GL (ODL excluded): AVANTAGE B&P CAFE LTD,
Avantage B&R Italian Restaurants Ltd, CATERCOM LTD, CAYLINK LTD, CU CAFE LTD
(no postings after 2024), DAFERA LTD, HETAFRE TRADING LTD,
PHC FRANCHISED RESTAURANTS PUBLIC LTD, WOW BURGERS LTD.

**Access scope:** most users may see only some of these companies (see the
"Company scope" section of your instructions). The SQL tool enforces it: it
limits `dbo.sapbw_gl` and `dbo.sapbw_budgets` to the user's companies, and it
rejects any table other than sapbw_gl, sapbw_coa and sapbw_budgets, as well as
three-part names. Write queries normally (`dbo.sapbw_gl g`); a query that
returns no rows for a company outside the scope is expected, not an error.

**Brand = companyName + CostCenter** (from the store master
`apidata_replica.dim_store`, snapshot 2026-11-06). Use this CASE to answer
per-brand questions:

```sql
CASE
  WHEN companyName = 'PHC FRANCHISED RESTAURANTS PUBLIC LTD' AND CostCenter = 'PH'   THEN 'PIZZA HUT'
  WHEN companyName = 'PHC FRANCHISED RESTAURANTS PUBLIC LTD' AND CostCenter = 'KFC'  THEN 'KFC'
  WHEN companyName = 'PHC FRANCHISED RESTAURANTS PUBLIC LTD' AND CostCenter = 'TACO' THEN 'TACO BELL'
  WHEN companyName = 'WOW BURGERS LTD'                       AND CostCenter = 'BK'   THEN 'BURGER KING'
  WHEN companyName = 'DAFERA LTD'                            AND CostCenter = 'DAF'  THEN 'WAGAMAMA'
  WHEN companyName = 'HETAFRE TRADING LTD'                   AND CostCenter = 'NER'  THEN 'CAFÉ NERO'
  WHEN companyName = 'CAYLINK LTD'                                                    THEN 'CAFÉ NERO'
  WHEN companyName = 'AVANTAGE B&P CAFE LTD'                 AND CostCenter = 'CAF'  THEN 'PAUL'
  WHEN companyName = 'Avantage B&R Italian Restaurants Ltd'  AND CostCenter = 'REST' THEN 'JAMIE OLIVER'
  WHEN companyName = 'CATERCOM LTD'                          AND CostCenter IN ('CAF','REST') THEN 'C&R'
  WHEN companyName = 'CATERCOM LTD'                          AND CostCenter = 'DER'  THEN 'TAVERNAKI'
  WHEN companyName = 'CATERCOM LTD'                          AND CostCenter = 'CAT'  THEN 'CATERING'
  ELSE 'UNALLOCATED / HEAD OFFICE'
END AS brand
```

- `HO`, `WH&CK`, `CCOM` and empty cost centres are head-office/unallocated —
  report them as "Unallocated / head office", never spread them over brands.
- CAYLINK budgets use cost centre `NER`, its GL uses `CAF`: match Caylink by
  company only.
- 2025 marketing spend by brand, for sanity: Pizza Hut ≈ €2.39M, Burger King
  ≈ €0.81M, Wagamama ≈ €0.72M, KFC ≈ €0.61M, Café Nero (Hetafre) ≈ €0.50M,
  Taco Bell ≈ €0.37M.
- Brand split is **not** validated against Power BI (the widget has no brand
  breakdown) — mention that when giving brand figures.
- Stores: `StoreLocationCode` gives the store for store-level questions
  (name in `StoreLocationName`); most marketing is posted on head-office codes
  (`201`, `201A`, …), so store-level marketing is usually small.

## 5. Proven patterns

All use the `coa` / `mkt` CTE from §3 (change the date range). Only the final
SELECT is shown.

**Totals per year (columns like Power BI)**

```sql
SELECT YEAR(PostingDate) AS year, -SUM(value) AS spend FROM mkt GROUP BY YEAR(PostingDate) ORDER BY year
```

**Month by month**

```sql
SELECT YEAR(PostingDate) AS year, MONTH(PostingDate) AS month, -SUM(value) AS spend
FROM mkt GROUP BY YEAR(PostingDate), MONTH(PostingDate) ORDER BY year, month
```

**Year to date vs same period last year** — range covers both years, compare
only up to the same day:

```sql
SELECT YEAR(PostingDate) AS year, -SUM(value) AS spend
FROM mkt
WHERE DATEFROMPARTS(2000, MONTH(PostingDate), DAY(PostingDate)) <= DATEFROMPARTS(2000, MONTH(GETDATE()), DAY(GETDATE()))
GROUP BY YEAR(PostingDate)
```

(set the CTE range to `>= 'prev-year-01-01' AND < 'current-year+1-01-01'`;
year 2000 is a leap year so 29 Feb is safe.)

**By line and account (drill-down)**

```sql
SELECT line_name, account_code, account_name, -SUM(value) AS spend
FROM mkt GROUP BY line_name, account_code, account_name ORDER BY line_name, spend DESC
```

**Top suppliers / vendors** — the supplier comes from the payables line of
the same document (keep the inner date range equal to the CTE's):

```sql
SELECT TOP 15 ISNULL(s.supplier, '(journal entry, no supplier)') AS supplier, -SUM(m.value) AS spend
FROM mkt m
LEFT JOIN (
  SELECT databaseId, TransId, MAX(BPName) AS supplier
  FROM dbo.sapbw_gl
  WHERE BPName <> '' AND PostingDate >= '2025-01-01' AND PostingDate < '2026-01-01'
  GROUP BY databaseId, TransId
  HAVING COUNT(DISTINCT BPName) = 1
) s ON s.databaseId = m.databaseId AND s.TransId = m.TransId
GROUP BY ISNULL(s.supplier, '(journal entry, no supplier)')
ORDER BY spend DESC
```

`HAVING COUNT(DISTINCT BPName) = 1` matters: AP invoices always have exactly
one partner, but most journal entries carry many (13.5k of 15.2k marketing
JEs in 2025), so `MAX(BPName)` alone would pin them on an arbitrary partner.
Journal entries (accruals, recharges, provisions) are a large share of
marketing value and have no supplier — the `LineRemarks` text usually names
the counterparty instead.

**Largest individual postings ("what drove it")**

```sql
SELECT TOP 20 PostingDate, companyName, line_name, TransTypeName, LineRemarks, -value AS spend
FROM mkt ORDER BY value ASC
```

**Share of sales** — marketing as % of sales needs Sales from the same GL:
sales = accounts with `Level1Code = '400000000000000'` and Level4 `410100`
("Sales"), same `-3` / ODL exclusions, value = Credit − Debit (positive).
⚠️ Sales totals have NOT been reconciled to Power BI (they differ by ~0.2%);
state this when you report a %.

**Budget vs actual (marketing)**

```sql
WITH coa AS (SELECT DISTINCT Level3Name, Level4Code, Level4Name, Level5Code FROM dbo.sapbw_coa),
bud AS (
  SELECT b.companyname AS companyName,
         CASE WHEN b.U_Acctcode IN ('61012014','61012015','61012016') THEN 'Internet Advertising Expenses' ELSE c.Level4Name END AS line_name,
         -(ISNULL(b.U_BAJAN,0)+ISNULL(b.U_BAFEB,0)+ISNULL(b.U_BAMAR,0)+ISNULL(b.U_BAAPR,0)+ISNULL(b.U_BAMAY,0)+ISNULL(b.U_BAJUN,0)
           +ISNULL(b.U_BAJUL,0)+ISNULL(b.U_BAAUG,0)+ISNULL(b.U_BASEP,0)+ISNULL(b.U_BAOCT,0)+ISNULL(b.U_BANOV,0)+ISNULL(b.U_BADEC,0)) AS budget
  FROM dbo.sapbw_budgets b
  JOIN coa c ON c.Level5Code = b.U_Acctcode
  WHERE b.U_YEAR = '2025' AND b.databaseId <> 'ODLONEDB'
    AND c.Level3Name = 'Marketing'
    AND (c.Level4Code <> '610120' OR b.U_Acctcode IN ('61012014','61012015','61012016'))
)
SELECT line_name, SUM(budget) AS budget FROM bud GROUP BY line_name ORDER BY budget DESC
```

Run actuals with the `mkt` CTE for the same year and grouping, then combine
the two result sets in your answer (variance = actual − budget; over budget
when actual spend > budget). For **year-to-date** budget, sum only the months
up to the last complete month. Budget numbers are not validated against
Power BI's budget pages.

## 6. Reference totals (for self-checks)

Power BI Marketing Cost (ledger sign; spend is the absolute value):

| Year | Total       |
| ---- | ----------- |
| 2023 | (4,205,443) |
| 2024 | (5,119,444) |
| 2025 | (6,158,310) |

If your all-company yearly total for those years differs, a rule from §3 is
missing. 2026 is still open (Power BI was ≈ €17.6k behind the GL on 2026-11-06).

## 7. Answering guide

- "How much did we spend on marketing in X?" → total spend for the period, then
  the top 5 lines; state companies included (all except ODL).
- "Biggest increase/decrease" → compare two periods per line; show absolute and
  % change; be clear whether periods are full years or year-to-date.
- Brand questions → use the §4 CASE; keep "Unallocated / head office" visible.
- "What is in line X?" → drill into accounts, then top suppliers/postings.
- Aggregator marketing (Wolt/Bolt/Foody ads) → accounts 61012014/15/16 only;
  aggregator **commissions** (other 610120 accounts) are NOT marketing — say so
  if the user asks about them.
- Promotional Discounts & Complimentaries is not cash spend (free product);
  mention it when it dominates an answer.
- Always say "excluding ODL One Delivery and year-end closing entries, as in
  the Power BI dashboard" once per answer that gives totals.
