# Management Accounts – Overview → "Financial Performance" widget: reverse-engineered model

Source: `docs/Management accounts dashboard.pbix` (extracted 2026-11-06 with `pbixray` 0.15.5 + the PBIR JSON inside the file).
Raw extracts: [`extracted/`](extracted/) (`schema.csv`, `relationships.csv`, `measures.csv`, `m_parameters.csv`).

Each fact below is tagged **[V]** verified from the file, **[A]** assumed / inferred, or **[?]** unknown.

## 1. Headline: this file is a thin report – the real model is elsewhere

- **[V]** The only data source in the file is a DirectQuery connection to a **published Power BI semantic model**, not MSSQL:
  ```
  AnalysisServices.Database("powerbi://api.powerbi.com/v1.0/1593330e-4479-409d-887b-bc481d071d03/Management%20Accounts%20Dashboard",
                            "Management accounts dashboard")
  ```
  Workspace id `1593330e-4479-409d-887b-bc481d071d03`, semantic model "Management Accounts Dashboard".
- **[V]** All 282 measures are stubs of the form `EXTERNALMEASURE("<name>", DOUBLE, "DirectQuery AS - …")`. **No DAX is in this file.**
- **[V]** There are no Power Query/M partitions and no MSSQL connection strings. Every column has cardinality 1, so **no data is in the file either.**
- What _is_ recoverable from it: table/column schema, relationships, measure names and display folders, the full report layout, and the custom-visual subtotal formulas.

**Consequence:** the DAX for `Financial Performance Overview`, and the MSSQL tables or views behind `FACT1_SAP` / `DIM1_Account_Mapping` / etc., can only come from the upstream semantic model (see §7).

## 2. The widget

- **[V]** Page `80d4d6f6530889be1197` "Management Accounts - Overview". The widget is the third-party custom visual **Financial Reporting Matrix** (`financialreportingmatrixD8A502553641450F8EAEB9BA40B2166E`, a.k.a. "eaze"), not the native matrix.
- **[V]** There are two copies at the same position, toggled by the bookmark group "MTD - YTD Overview":

  | Bookmark | Visible matrix         | Visible month slicer                        |
  | -------- | ---------------------- | ------------------------------------------- |
  | Month    | `4d457e5826e099989ecb` | "Month Single" (`17b1db…`)                  |
  | YTD      | `cdf99fcfde4b60a76a9c` | "Month All" (`c68ead…`, inverted selection) |

  Both copies have **identical queries**. The only difference is which month slicer feeds them. **[A]** The measure itself decides MTD vs. YTD from the month selection, probably via `DIM0_Calendar Table`[Dynamic Month] / [YTD Month].

### Query (both copies) [V]

| Role    | Field                                                                                    |
| ------- | ---------------------------------------------------------------------------------------- |
| Rows L0 | `DIM1_Account_Mapping`[FOS First Breakdown]                                              |
| Rows L1 | `DIM1_Account_Mapping`[FOS Overview]                                                     |
| Rows L2 | `DIM1_Account_Mapping`[Management L5 (Adj. for contrl.)]                                 |
| Rows L3 | `DIM1_Account_Mapping`[Level5Name]                                                       |
| Columns | `Z_Change_Table CY_PY_PY2 FPO`[Column Headers] (table columns: `Column Headers`, `Sort`) |
| Values  | measure `Z_Change_Table CY_PY_PY2 FPO`[Financial Performance Overview]                   |

- **[A]** `Z_Change_Table CY_PY_PY2 FPO` is a disconnected header table (CY / PY / PY2 / variance columns), and the measure is a `SWITCH(SELECTEDVALUE([Column Headers]), …)`. Its header values are not in the file.
- Visual-level filters **[V]**:
  - `Management Account` is not blank (both copies).
  - `FOS Overview` ≠ `'Check'` (YTD copy only). The Month copy has the filter card but **no condition**, so `Check` rows may leak into the Month view. Worth confirming in the live report.

### Subtotal rows – computed inside the visual, not in the model [V]

The row ids are the L0 (`FOS First Breakdown`) values with spaces replaced by `_`, plus a `_0` suffix. Both copies carry the same formulas:

| Inserted after         | Row                               | Formula                                                                       |
| ---------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| Aggregator Commissions | Total Expenses                    | Other Expenses + Aggregator Commissions                                       |
| Total Expenses         | **Gross Profit**                  | Sales + Food Cost + Labour Cost + Total Expenses                              |
| P&R Expenses           | **Operating Profit**              | Gross Profit + P&R Expenses                                                   |
| Other Income           | Profit/(Loss) Before Dep, Am, Div | Operating Profit + HO Expenses + Marketing Cost + Other Income + Finance Cost |
| Dividends              | Profit/(Loss) After Dep, Am, Div  | Before Dep… + Depreciation + Amortisation + Dividends                         |
| After Dep…             | **EBITDA**                        | Operating Profit + HO Expenses + Marketing Cost + Other Income                |
| EBITDA                 | EBITDA (excl. other income)       | Operating Profit + HO Expenses + Marketing Cost                               |

- **[V]** The L0 categories referenced are Sales, Food Cost, Labour Cost, Other Expenses, Aggregator Commissions, P&R Expenses, HO Expenses, Marketing Cost, Other Income, Finance Cost, Depreciation, Amortisation and Dividends. **[A]** That is the full value list of `FOS First Breakdown`.
- **[A]** Everything is added, never subtracted, so **costs must already be negative** in the measure output. The model has separate `… Positive …` measures (e.g. `1.2.1 Positive Food Cost`), which supports this. **[A]** The base value is probably `FACT1_SAP`[Value (EUR)] or Credit − Debit.
- **[V]** The "Before Dep, Am, Div" row includes Finance Cost but sits _after_ it, while EBITDA excludes it. Confirm with finance that this is intended.
- **[V]** The default expansion state has only `Marketing_Cost_0` expanded.

## 3. Page filters and slicers that hit the widget [V]

- Bookmark-captured page filter: `DIM2_Store`[Trading Nature] **NOT IN** (blank, `CALL CENTRE`, `MAINTENANCE`, `WAREHOUSE`, `TRAINING  CENTRE`). Note the double space in `TRAINING  CENTRE`.
- Slicers:
  - `DIM0_Calendar Table`[Year] and [MonthNameLong]
  - `DIM2_Store`[Company], [Brand], [Trading Nature], [Open/Closed]
  - `Sorting_Table_District`[District]
  - `Sorting_table_status`[Status], which goes through `FACT6_StoreStatus`

## 4. Tables used by the widget (schema) [V]

**DIM1_Account_Mapping** (chart of accounts → management P&L lines)

- Key: `Level5Code` (= SAP GL account)
- Also: `Level5Name`, `Level4Code`, `SAP AccountLevel4`, `Management L0`…`L5`, `Management L5 (Adj. for contrl.)`, `Management Account`
- FOS columns: `FOS First Breakdown`, `FOS First Breakdown Sort`, `FOS Overview`, `FOS Sort`, `Sort`
- Expense flags: `Controllable/Uncontrollable Expenses`, `Controllable expenses`, `Drivers Cost`, `Delivery Service`

**FACT1_SAP** (actual GL postings)

- Dates: `PostingDate`, `LastModified`, `UpdatedAt`
- Document fields: `Transaction Number`, `TransTypeName`, `OriginalDocNo`, `HeaderRemarks`, `Actual`, `FS Type`
- Account: `GLAccount`, `AccountName`
- Amounts: `Debit`, `Credit`, `Value (EUR)`
- Store / company: `StoreLocationCode`, `StoreLocationCode (OLD)`, `StoreLocationName`, `CostCenter`, `CostCenter (OLD)`, `CompanyName`, `BI unique code`, `Merged BI - Date`
- Data-quality checks: `CC vs PC check`, `Check`

**FACT5_Intermediary_StoreDates** (bridge)

- `Date`, `BI unique code`, `Merged BI - Date`

**DIM2_Store**

- Codes: `BI unique code`, `BI Name`, `SAP Location Code`, `SAP Location name`, `SAP Distribution Code`, `SAP CompanyName`, `Novasero Location Code`
- Grouping: `Brand`, `Company`, `Trading Nature`, `District`, `Area Nature Group`, `Country`
- Status / dates: `Open/Closed`, `Working`, `Start date`, `End date`
- Location: `Mall`, `Mall name`, `Address`, `Latitude`, `Longitude`
- Other: `Seasonality`, `Brand/store check`

**DIM0_Calendar Table**

- `Date`, `Year`, `MonthNumber`, `MonthNameLong`, `YearMonthNumber`
- Flags: `MTD Tag`, `YTD Tag`, `Current Year/Previous Year`
- `Latest Date`, `Today`, plus about 20 more (see `schema.csv`)

## 5. Relationships relevant to the widget [V]

```
DIM1_Account_Mapping[Level5Code] 1 ──< FACT1_SAP[GLAccount]                      (single)
FACT5_Intermediary_StoreDates[Merged BI - Date] 1 ──< FACT1_SAP[Merged BI - Date] (single)
DIM2_Store[BI code] 1 ──< FACT5_Intermediary_StoreDates[BI code]                  (BOTH)
DIM0_Calendar Table[Date] 1 ──< FACT5_Intermediary_StoreDates[Date]               (BOTH)
Sorting_Table_District[District] 1 ──< DIM2_Store[District]                       (BOTH)
```

- **[V]** `FACT1_SAP` has **no direct relationship** to the calendar or to the store dimension. Both reach it only through the store+date bridge `FACT5`, joined on the concatenated key `Merged BI - Date`.
- **[A]** The key is `BI unique code & date`. Its exact format and date granularity (day or month) are unknown.
- **[?]** `relationships.csv` names the store key `BI code` / `Merged BI Date`, while the column list says `BI unique code` / `Merged BI - Date`. This is probably an internal name vs. display name difference; check upstream.
- Budget (`FACT2_BUDGET`) and Forecast (`FACT3_FORECAST`) use the same pattern (`Account Code` → `Level5Code`, `Merged BI Date` → bridge), but the Overview widget doesn't use them.
- **[V]** The `LocalDateTable_*` tables are Power BI's auto date/time and can be ignored.

**SQL shape [A]:**

```sql
FROM FACT1_SAP f
JOIN DIM1_Account_Mapping a ON a.Level5Code = f.GLAccount
JOIN FACT5_Intermediary_StoreDates b ON b.[Merged BI - Date] = f.[Merged BI - Date]
JOIN DIM2_Store s ON s.[BI unique code] = b.[BI unique code]
JOIN Calendar c ON c.Date = b.Date
WHERE a.[Management Account] IS NOT NULL
  AND a.[FOS Overview] <> 'Check'
  AND s.[Trading Nature] NOT IN (...)
GROUP BY a.[FOS First Breakdown], a.[FOS Overview], a.[Management L5 (Adj. for contrl.)], a.[Level5Name]
```

## 6. Related measures (names only – DAX not available) [V]

- **Calendar:** `DIM0_Calendar Table` has `Dynamic Month`, `YTD Month`, `CY Title`, `PY Title`, `SelectedDate1`, `SelectedDate2`.
- **FACT1_SAP, `Overview` folder.** These are the line-level equivalents of the widget rows, useful later as a reconciliation oracle:
  - Sales and expenses: `1.1 Sales`, `1.2 Food Cost`, `1.2.2 Labour cost`, `1.2.3 Other Expenses`, `1.2.4 Aggregators Commission`, `1.5 P&R Expenses`, `1.7 Total HO expenses`
  - Profit lines: `1.4 Gross Profit`, `1.6 Operating Profit`, `1.8 Profit & Loss Before Dep, Am, Div`
  - Below the line: `1.9 Depreciation`, `1.9.1 Amortization`, `1.9.2 Dividends received`, `1.9.3 Profit/ (Loss) after dep, am, div`
  - EBITDA: `1.9.4 EBITDA`, `1.9.5 EBITDA (excl. other income)`
  - Base value: `Value (EUR) - Actual`
- The full list of 282 is in `extracted/measures.csv`.

## 7. How to get what's missing (DAX + MSSQL sources)

Pick one; they're listed in order of effort:

1. **Download the upstream model's .pbix** from the Power BI Service:
   - Workspace `1593330e-…` → semantic model "Management Accounts Dashboard" → _Download this file_.
   - Then rerun the same extraction (`pbixray` → `dax_measures`, `power_query`). This yields every DAX formula and the M queries naming the MSSQL server, DB and tables.
2. **XMLA endpoint** (only if the workspace is Premium / PPU / Fabric): connect DAX Studio or Tabular Editor to `powerbi://api.powerbi.com/v1.0/myorg/<workspace name>` and query:
   - `$SYSTEM.TMSCHEMA_MEASURES`
   - `$SYSTEM.TMSCHEMA_PARTITIONS` (QueryDefinition = M/SQL)
   - `$SYSTEM.TMSCHEMA_COLUMNS`
3. **Ask the model owner** for a PBIP/TMDL export.

This needs someone with Build/Contributor rights on that workspace. That's the user's action, not something the repo can do.

## 8. Open questions

1. What are the values of `Z_Change_Table CY_PY_PY2 FPO`[Column Headers] (CY, PY, PY2, Δ%…)? And how does the measure pick MTD vs. YTD?
2. What is the sign convention of the base value? (Assumed: revenue +, costs −.)
3. What is the format of `Merged BI - Date`, and is the bridge at day or month grain?
4. Are `DIM1_Account_Mapping` and `DIM2_Store` MSSQL tables, or Excel/SharePoint sources merged in Power Query? Many such mapping tables are hand-maintained spreadsheets.
5. Is it intended that the Month copy is missing the `FOS Overview ≠ 'Check'` filter?
6. Is Finance Cost meant to sit inside "Before Dep, Am, Div" while EBITDA excludes it?

## 9. MSSQL correlation (`SAPBW`, probed 2026-11-06, read-only as `sapbwuser`)

### Power BI table → SAPBW source

| PBI table                    | SAPBW source                                                                   | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FACT1_SAP                    | `dbo.sapbw_gl` (7.1M rows, 10 companies, 2022 →)                               | **[V]** Raw columns map 1:1: `PostingDate`, `TransTypeName`, `OriginalDocNo`, `HeaderRemarks`, `GLAccount`, `AccountName`, `Debit`, `Credit`, `StoreLocationCode/Name`, `CostCenter`, `companyName`, `LastModified`, `UpdatedAt`; `Transaction Number` ← `TransId`. **[A]** `Value (EUR)` = `Credit − Debit` (revenue +, costs −, the same sign as the budgets). **Derived, rules unknown:** `BI unique code`, `Merged BI - Date`, `StoreLocationCode (OLD)`, `CostCenter (OLD)`, `FS Type`, `Check`, `CC vs PC check`, `Actual` |
| DIM1_Account_Mapping         | `dbo.sapbw_coa` (1,185 rows)                                                   | **[V]** Only `Level5Code`, `Level5Name`, `Level4Code`, `Level4Name` (= `SAP AccountLevel4`). **Missing:** `FOS First Breakdown`, `FOS Overview`, `Management L0–L5`, `Management L5 (Adj. for contrl.)`, `Management Account`, `Sort`/`FOS Sort`/`FOS First Breakdown Sort`, plus the controllable/driver/delivery flags. These columns build the widget's rows and filters.                                                                                                                                                     |
| FACT2_BUDGET                 | `dbo.sapbw_budgets` `U_BA{JAN..DEC}`, unpivoted to a monthly `Date`            | **[V]** Same sign as GL. Every `U_Acctcode` exists in the COA. Keyed by `databaseId`, `U_YEAR`, `U_CostCentre`, `U_Location`, `U_Acctcode`                                                                                                                                                                                                                                                                                                                                                                                       |
| FACT3_FORECAST               | `dbo.sapbw_budgets` `U_FA{JAN..DEC}` **[A]**                                   | **[V]** Mostly NULL: only PHC_EUR 2024 and DAFERA_PROD_EUR 2025 have values                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| DIM2_Store                   | **ClickHouse `apidata_replica.dim_store`** (375 rows, unique `BI unique code`) | **[V]** All Power BI columns are present except `Open/Closed` and `Brand/store check`; see §9.1. `sapbw_locations` is not needed                                                                                                                                                                                                                                                                                                                                                                                                 |
| DIM0 Calendar, FACT5 bridge  | generated / derived                                                            | Easy to rebuild once the store master exists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| FACT6_StoreStatus, FACT7_BOY | derived / probably Excel (`Description - <Month>`)                             | Not needed for the Financial Performance widget                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Not used yet: `U_BT*` / `U_FT*` (int) in budgets look like budgeted **transaction counts** per sales account (e.g. "Sales Delivery - Foodys" 400). **[A]**

### 9.1 Store dimension: ClickHouse `apidata_replica.dim_store` [V]

- **Replica table:** ReplacingMergeTree with `_sign` / `_version` columns. Query it with `FINAL WHERE _sign = 1`. Today all 375 rows are live, but that won't always hold.
- **Same columns as Power BI's `DIM2_Store`.** Names differ only in case: `brand`, `company`, `district`, `working`, `mall`, `address`, `latitude`, `longitude`, `country`, `seasonality`.
  - Extra columns: `brand_alias` (already used by `src/lib/services/brand-project-codes.server.ts`) and `Sales Dashboard Brand Group Line`.
  - **Missing:** `Open/Closed`. **[A]** It can be derived as `End date` empty → Open; `working = 'CLOSED'` always has an `End date` (24/24).
- **Dates are strings** in `dd/MM/yyyy` (`Start date` is `01/01/2000` for legacy stores), and `End date` is `''` when open. Parse them with `parseDateTime32BestEffortOrNull` or `toDate(parseDateTimeBestEffort(...))`, with day-first order. **Check before use.**
- The `Trading Nature` values include the four the report excludes: `CALL CENTRE`, `MAINTENANCE`, `WAREHOUSE`, `TRAINING  CENTRE` (with a double space). There are also 11 `UNALLOCATED` rows and 141 `FLEET` rows (ODL drivers).
- **GL → store join.** Covers all 2025 P&L lines, 591,901 in total:

  | Join rule                                                                                                                  | Lines   | Revenue € |
  | -------------------------------------------------------------------------------------------------------------------------- | ------- | --------- |
  | `StoreLocationCode = SAP Location Code` **and** `CostCenter = SAP Distribution Code`                                       | 571,580 | 109.84M   |
  | Same key, but it maps to 2 stores (`CAF507`/`CAF` → `CAF507 AK` Akashi Delivery + `CAF507 PO` Pier One)                    | 17,836  | 2.57M     |
  | Fallback `companyName = SAP CompanyName` + `StoreLocationCode` (the GL cost centre differs, mostly ODL `P2xx` fleet codes) | 1,756   | 0.75M     |
  | Fallback `StoreLocationCode` alone (unique)                                                                                | 88      | 0.01M     |
  | Empty `StoreLocationCode` (no store)                                                                                       | 641     | 1.80M     |
  | No match                                                                                                                   | 0       | 0         |

- **Traps:**
  - 6 Greek stores (`GR-*`) have empty SAP codes. **Never join on an empty key**, or no-store GL lines attach to Greek stores.
  - `CAF507` can't be split from the GL alone. **[?]** How Power BI attributes it (probably through `Merged BI - Date` built upstream) is unknown.

### Data traps [V]

1. **Closing/opening entries:** `TranstypeCode = '-3'` (`ClosingYearEntry`) batches post every December and January (≈4k lines each). With them included, every P&L class nets to exactly 0 for the year. **Exclude them.**
2. **The COA is single-company** (only `databaseId = 'PHC_EUR'` is present), but account codes are shared across the group. Join on `Level5Code` only, never on `databaseId`. That join covers all GL accounts except balance-sheet ones and **one P&L account: `51030310` Motor Bike Rental** (ODLONEDB, −€416k all-time). The `Management Account` not-blank filter would drop it.
3. **Future-dated postings:** JournalEntries go up to 2027-11 (accruals and reversals, across all companies). Bound every query by period, and do not derive "latest date" from `MAX(PostingDate)`.
4. **Store codes:**
   - GL `StoreLocationCode` values look like `PH202`, `REST272`, `201`, `CAT295`.
   - GL `CostCenter` holds the division (`PH`, `HO`, `NER`, `CAT`, `REST`, `WH&CK`).
   - Budgets use the same format in `U_Location` / `U_CostCentre`.
   - `StoreLocationCode ≠ CostCenter` on most lines, so the report's "Distribution Code <> Project Code" page is a data-quality check, not a join rule.
   - Since 2025, P&L lines with no store code are small: 72 revenue lines (€1.8M), 857 COS lines.
5. **Revenue scale:** group revenue in 2025 (Cr − Dr, excluding closing entries) is €115.0M across 10 companies, including intercompany. **[?]** Whether the Power BI report eliminates intercompany is unknown.
6. **No other source is reachable:** `sapbwuser` is denied on `BS1QLIK`, `SAPInterfaceDB` and the company DBs. No other SAPBW table contains FOS/Management/Brand/Trading-nature columns (only `sapbw_items.brand`).

### Missing inputs (blocking an exact port)

1. **Management account mapping:** `Level5Code` → FOS First Breakdown / FOS Overview / Management L5 (adj.) / Management Account, plus the sort orders. Probably an Excel/SharePoint file in the upstream model.
2. ~~Store master~~. Resolved by ClickHouse `dim_store` (§9.1). Still open: the `Open/Closed` rule and the `CAF507` split.
3. **Re-coding rules** for `StoreLocationCode (OLD)` / `CostCenter (OLD)`.

### Draft base query [A – unvalidated against Power BI]

```sql
SELECT g.databaseId,
       g.StoreLocationCode,
       g.CostCenter,
       c.Level5Code,
       c.Level5Name,
       DATEFROMPARTS(YEAR(g.PostingDate), MONTH(g.PostingDate), 1) AS period,
       SUM(g.Credit - g.Debit) AS value_eur          -- revenue +, costs −
FROM SAPBW.dbo.sapbw_gl g
JOIN SAPBW.dbo.sapbw_coa c ON c.Level5Code = g.GLAccount   -- not on databaseId: COA holds PHC_EUR only
WHERE g.TranstypeCode <> '-3'                               -- drop year-end closing/opening
  AND c.Level1Code >= '400000000000000'                     -- P&L classes 4–8
  AND g.PostingDate >= @from AND g.PostingDate < @to
GROUP BY g.databaseId, g.StoreLocationCode, g.CostCenter, c.Level5Code, c.Level5Name,
         DATEFROMPARTS(YEAR(g.PostingDate), MONTH(g.PostingDate), 1);
```

After this: join the management mapping on `Level5Code` and the store master on `StoreLocationCode`, apply the §3 filters, then compute the §2 subtotals.

**Acceptance check:** for one closed month (e.g. 2025-09), totals per `FOS First Breakdown` must match the live Power BI widget. Sales should match to the euro.

## 10. Marketing Cost block – rebuilt from SAPBW (2026-11-06)

Implemented in `src/lib/services/management-accounts{,.server}.ts` and shown at `/management-accounts/marketing-costs` (admin + superUser).

Rules were found by matching the Power BI widget's year columns. Every rule is **[V]** against a screenshot taken 2026-11-06:

- **Columns:** calendar years. The current year counts everything posted so far. There is no store, trading-nature or month filter; applying the page's store filters made the match _worse_.
- **Rows:** `sapbw_coa.Level4Name` where `Level3Name = 'Marketing'` (codes `6101xx`), sorted by name. Each row expands to `Level5Name`.
- **Reclassification:** accounts `61012014/15/16` (Foody/Wolt/Bolt "Marketing Costs") are counted under **Internet Advertising Expenses**. The rest of `610120` (Aggregators Fees & Advertising) belongs to the Aggregator Commissions block and is excluded.
- Rows the screenshot cuts off are still part of the total: Sponsorships, Vacancies Marketing Expenses, Website expenses & Tools.
- **Value** = `SUM(Credit − Debit)`, excluding `TranstypeCode = '-3'`.
- **Join** on `Level5Code` only, against a `DISTINCT` COA.
- **Company exclusion:** `databaseId = 'ODLONEDB'` (ODL One Delivery) is left out. Power BI drops it from the whole widget, not only from Marketing (see below).

### Validation against the Power BI export (`docs/Financial Performance.xlsx`, 2026-11-06)

The export holds every widget row at `Level5Name` × year, 2,123 rows in total. Its Marketing totals equal the screenshot.

- **Hierarchy:** every Marketing account sits under the same `Management L5 (Adj. for contrl.)` line as our COA Level4, after the 61012014/15/16 reclass. **[V]**
- **Values:** 366 of 368 account × year cells match to €0.50. 2023, 2024 and 2025 match **exactly** at both total and account level. **[V]**
- **Remaining 2026 gaps** (ours − PBI): Media Advertising TV `61010000` −€6,000 and Sponsorships `61011300` −€11,620, −€17,620 in total. **[?]** Probably postings that changed after the PBI dataset's last refresh. All 2026 lines carry `UpdatedAt` 2026-11-05/06, so the SAPBW sync timestamps can't tell. To confirm, re-export after a PBI refresh.
- **Why ODL is excluded:** before the exclusion, every Marketing residual in 2023–2025 equalled exactly the ODL postings for that account and year, all on location `201` / cost centre `HO`. Across the whole widget (comparing by `Level5Name`), excluding ODL also closes Finance Cost (2024–26) and Depreciation (2023–24). **[V]** Why Power BI drops ODL is unknown: `201-ODL HO` does exist in ClickHouse `dim_store`. **[?]**
- **Other blocks still differ** after the exclusion, e.g. Sales vs Other Income by ±€0.18–0.72M a year. That points to a Level5 reclass in the PBI mapping, to be investigated when porting those blocks.

**The `.pbip`:** `docs/Management accounts dashboard.pbip` (2026-11-06) is only a pointer to a `.Report` folder. It has no SemanticModel, so no DAX is available from it either.
